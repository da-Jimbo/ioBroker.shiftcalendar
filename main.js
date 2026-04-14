'use strict';

const utils = require('@iobroker/adapter-core');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Pure Hilfsfunktionen ────────────────────────────────────────────────────

function dateMidnight(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseTime(str) {
    if (!str || !str.includes(':')) return null;
    const [h, m] = str.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return { h, m };
}

function getShiftKey(date, pattern, referenceDate) {
    const diff = Math.round((dateMidnight(date) - dateMidnight(referenceDate)) / MS_PER_DAY);
    const len  = pattern.length;
    return pattern[((diff % len) + len) % len].toUpperCase();
}

function minutesUntilEnd(endTimeStr, now) {
    const t = parseTime(endTimeStr);
    if (!t) return null;
    const target = new Date(now);
    target.setHours(t.h, t.m, 0, 0);
    let diff = Math.round((target - now) / 60000);
    if (diff < 0) diff += 24 * 60;
    return diff;
}

function formatMinutes(mins) {
    if (mins === null || mins === undefined) return '-';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function buildVacationSet(entries) {
    const set = new Set();
    if (!Array.isArray(entries)) return set;
    for (const e of entries) {
        if (e.date && e.date.length >= 10) {
            set.add(e.date.slice(0, 10));
        } else if (e.from && e.to) {
            const cur = dateMidnight(e.from);
            const to  = dateMidnight(e.to);
            while (cur <= to) {
                set.add(cur.toISOString().slice(0, 10));
                cur.setDate(cur.getDate() + 1);
            }
        }
    }
    return set;
}

function isVacationDay(date, vacSet) {
    return vacSet.has(dateMidnight(date).toISOString().slice(0, 10));
}

function nextTriggerMs(shiftDefs, now) {
    const candidates = [];
    const midnight = dateMidnight(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setSeconds(5);
    candidates.push(midnight.getTime());
    for (let offset = 0; offset <= 1; offset++) {
        const base = new Date(now);
        base.setDate(now.getDate() + offset);
        base.setHours(0, 0, 0, 0);
        for (const def of Object.values(shiftDefs)) {
            for (const timeStr of [def.start, def.end]) {
                const t = parseTime(timeStr);
                if (!t) continue;
                const cnd = new Date(base);
                cnd.setHours(t.h, t.m, 5, 0);
                if (cnd.getTime() > now.getTime()) candidates.push(cnd.getTime());
            }
        }
    }
    const next = Math.min(...candidates);
    const ms   = next - now.getTime();
    return Math.max(30_000, Math.min(ms, 15 * 60_000));
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

class ShiftCalendar extends utils.Adapter {

    constructor(options) {
        super({ ...options, name: 'shiftcalendar' });
        this.on('ready',  this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this._timer       = null;
        this._pattern     = '';
        this._shiftDefs   = {};
        this._refDate     = '';
        this._vacationSet = new Set();
    }

    async onReady() {
        this.log.info('ShiftCalendar gestartet');

        // Subscription hält den Prozess am Leben, auch ohne Config
        await this.subscribeStatesAsync('info.connection');

        if (!this._loadConfig()) {
            this.log.warn('Kein Schichtmuster konfiguriert. Bitte im Admin unter "Schichten" eintragen und Adapter neu starten.');
            await this.setStateAsync('info.connection', false, true);
            return; // Prozess bleibt am Leben wegen Subscription
        }

        await this._updateAllStates();
        await this.setStateAsync('info.connection', true, true);
        this._scheduleNextUpdate();
    }

    onUnload(callback) {
        if (this._timer) clearTimeout(this._timer);
        callback();
    }

    // ── Konfiguration laden ───────────────────────────────────────────────────

    _loadConfig() {
        const cfg = this.config;

        const pattern = (cfg.pattern || '').toUpperCase().replace(/\s/g, '');
        if (!pattern) {
            this.log.error('Kein Schichtmuster konfiguriert!');
            return false;
        }

        const shiftDefs = {};
        for (const row of (cfg.shiftDefs || [])) {
            const key = (row.key || '').toUpperCase().trim();
            if (!key) continue;
            shiftDefs[key] = {
                label: row.label || key,
                start: row.start || null,
                end:   row.end   || null,
                color: row.color || '#6b7280',
            };
        }

        for (const ch of pattern) {
            if (!shiftDefs[ch]) {
                this.log.warn(`Kürzel "${ch}" nicht definiert – wird als Freitag behandelt.`);
                shiftDefs[ch] = { label: ch, start: null, end: null, color: '#6b7280' };
            }
        }

        const refDate = (cfg.referenceDate || '').trim() || new Date().toISOString().slice(0, 10);

        this._pattern     = pattern;
        this._shiftDefs   = shiftDefs;
        this._refDate     = refDate;
        this._vacationSet = buildVacationSet(cfg.vacationEntries || []);

        this.log.info(`Muster: ${pattern} (${pattern.length} Tage), Referenz: ${refDate}, Urlaube: ${this._vacationSet.size}`);
        return true;
    }

    // ── States aktualisieren ──────────────────────────────────────────────────

    async _updateAllStates() {
        const now = new Date();

        const infoFor = (date, checkVacation = false) => {
            const key   = getShiftKey(date, this._pattern, this._refDate);
            const def   = this._shiftDefs[key] || { label: key, start: null, end: null, color: '#6b7280' };
            const isVac = checkVacation && isVacationDay(date, this._vacationSet);
            return {
                key,
                label:      isVac ? 'Urlaub' : def.label,
                color:      isVac ? '#22c55e' : def.color,
                isFree:     !def.start || isVac,
                isVacation: isVac,
                start:      isVac ? null : def.start,
                end:        isVac ? null : def.end,
            };
        };

        const d0 = new Date(now);
        const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
        const d2 = new Date(now); d2.setDate(d2.getDate() + 2);

        const cur = infoFor(d0, true);
        const tom = infoFor(d1);
        const dat = infoFor(d2);

        const diffDays = Math.round((dateMidnight(d0) - dateMidnight(this._refDate)) / MS_PER_DAY);
        const cycleDay = ((diffDays % this._pattern.length) + this._pattern.length) % this._pattern.length + 1;

        const minsEnd   = cur.isFree ? null : minutesUntilEnd(cur.end, now);
        const countdown = cur.isVacation ? 'Urlaub' : cur.isFree ? 'Frei' : formatMinutes(minsEnd);

        let nextInfo = null, daysUntil = 0;
        for (let i = 1; i <= 60; i++) {
            const d    = new Date(now); d.setDate(now.getDate() + i);
            const info = infoFor(d);
            if (!info.isFree) { nextInfo = info; daysUntil = i; break; }
        }

        const week = [];
        for (let i = 0; i < 7; i++) {
            const d    = new Date(now); d.setDate(now.getDate() + i);
            const info = infoFor(d);
            week.push({
                date:  d.toISOString().slice(0, 10),
                day:   ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()],
                key:   info.key,
                label: info.label,
                start: info.start,
                end:   info.end,
                color: info.color,
                free:  info.isFree,
            });
        }

        const states = [
            ['current.shiftKey',           cur.key],
            ['current.shiftLabel',         cur.label],
            ['current.shiftColor',         cur.color],
            ['current.isFree',             cur.isFree],
            ['current.isVacation',         cur.isVacation],
            ['current.shiftStart',         cur.start  || '-'],
            ['current.shiftEnd',           cur.end    || '-'],
            ['current.minutesUntilEnd',    minsEnd    ?? 0],
            ['current.countdown',          countdown],
            ['current.cycleDay',           cycleDay],
            ['tomorrow.shiftKey',          tom.key],
            ['tomorrow.shiftLabel',        tom.label],
            ['tomorrow.shiftColor',        tom.color],
            ['tomorrow.isFree',            tom.isFree],
            ['tomorrow.shiftStart',        tom.start  || '-'],
            ['tomorrow.shiftEnd',          tom.end    || '-'],
            ['dayAfterTomorrow.shiftKey',   dat.key],
            ['dayAfterTomorrow.shiftLabel', dat.label],
            ['dayAfterTomorrow.isFree',     dat.isFree],
            ['next.shiftKey',              nextInfo?.key   || '-'],
            ['next.shiftLabel',            nextInfo?.label || '-'],
            ['next.shiftStart',            nextInfo?.start || '-'],
            ['next.daysUntil',             daysUntil],
            ['week.json',                  JSON.stringify(week)],
            ['meta.pattern',               this._pattern],
            ['meta.cycleLength',           this._pattern.length],
            ['meta.lastUpdate',            now.toISOString()],
        ];

        for (const [id, val] of states) {
            await this.setStateAsync(id, val ?? '', true);
        }

        this.log.info(`Update | Heute: ${cur.label}${cur.isVacation ? ' (Urlaub)' : ''} | Morgen: ${tom.label} | Nächste Arbeit in ${daysUntil}d`);
    }

    // ── Scheduling ────────────────────────────────────────────────────────────

    _scheduleNextUpdate() {
        if (this._timer) clearTimeout(this._timer);
        const ms = nextTriggerMs(this._shiftDefs, new Date());
        this.log.debug(`Nächstes Update in ${Math.round(ms / 1000)}s`);
        this._timer = setTimeout(async () => {
            await this._updateAllStates();
            this._scheduleNextUpdate();
        }, ms);
    }
}

module.exports = (options) => new ShiftCalendar(options);
