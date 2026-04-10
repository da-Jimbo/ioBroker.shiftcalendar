'use strict';

const utils = require('@iobroker/adapter-core');

// ─── Constants ────────────────────────────────────────────────────────────────
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Built-in Presets ─────────────────────────────────────────────────────────
//
// 3schicht_21: 21-Tage-Modell  NNNNN-WE-SSSSS-WE-FFFFF-WE
//   Wochenenden (Sa/So) sind IMMER frei – kalenderbasiert, unabhängig vom Zyklus.
//   Zyklus zählt nur Werktage: 5N + 5S + 5F = 15 Werktage pro Durchlauf.
//   Nachtschicht-Start: So 22:00 → Mo 06:00 gilt als erster Werktags-N.
//
const PRESETS = {
    '3schicht_21': {
        label:        '3-Schicht 21-Tage (NNNNN-WE-SSSSS-WE-FFFFF-WE)',
        type:         'weekday_cycle',
        weekdayCycle: 'NNNNNSSSSSFFFFFF',   // 5N + 5S + 5F = 15 Werktage
        shiftTypes: {
            F: { label: 'Frühschicht',  start: '06:00', end: '14:00', color: '#f59e0b' },
            S: { label: 'Spätschicht',  start: '14:00', end: '22:00', color: '#3b82f6' },
            N: { label: 'Nachtschicht', start: '22:00', end: '06:00', color: '#8b5cf6' },
            W: { label: 'Wochenende',   start: null,    end: null,    color: '#10b981' },
        },
    },
    '3schicht': {
        label:   '3-Schicht (FFSSNNXX)',
        type:    'pattern',
        pattern: 'FFSSNNXX',
        shiftTypes: {
            F: { label: 'Frühschicht',  start: '06:00', end: '14:00', color: '#f59e0b' },
            S: { label: 'Spätschicht',  start: '14:00', end: '22:00', color: '#3b82f6' },
            N: { label: 'Nachtschicht', start: '22:00', end: '06:00', color: '#8b5cf6' },
            X: { label: 'Frei',         start: null,    end: null,    color: '#10b981' },
        },
    },
    '2schicht': {
        label:   '2-Schicht (FFSSXX)',
        type:    'pattern',
        pattern: 'FFSSXX',
        shiftTypes: {
            F: { label: 'Frühschicht', start: '06:00', end: '14:00', color: '#f59e0b' },
            S: { label: 'Spätschicht', start: '14:00', end: '22:00', color: '#3b82f6' },
            X: { label: 'Frei',        start: null,    end: null,    color: '#10b981' },
        },
    },
    '4schicht': {
        label:   'Kontinuierlicher Betrieb 4-Schicht (FSNX)',
        type:    'pattern',
        pattern: 'FSNX',
        shiftTypes: {
            F: { label: 'Frühschicht',  start: '06:00', end: '14:00', color: '#f59e0b' },
            S: { label: 'Spätschicht',  start: '14:00', end: '22:00', color: '#3b82f6' },
            N: { label: 'Nachtschicht', start: '22:00', end: '06:00', color: '#8b5cf6' },
            X: { label: 'Frei',         start: null,    end: null,    color: '#10b981' },
        },
    },
    'wechsel': {
        label:   'Wechselschicht (FNXX)',
        type:    'pattern',
        pattern: 'FNXX',
        shiftTypes: {
            F: { label: 'Frühschicht',  start: '06:00', end: '14:00', color: '#f59e0b' },
            N: { label: 'Nachtschicht', start: '22:00', end: '06:00', color: '#8b5cf6' },
            X: { label: 'Frei',         start: null,    end: null,    color: '#10b981' },
        },
    },
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

function parseTime(str) {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    return { h, m };
}

function dateMidnight(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function isWeekend(date) {
    const dow = new Date(date).getDay();
    return dow === 0 || dow === 6;
}

/** Zählt Werktage (Mo–Fr) zwischen ref (inkl.) und target (exkl.). */
function weekdayDiff(refDate, targetDate) {
    const ref    = dateMidnight(refDate);
    const target = dateMidnight(targetDate);
    if (ref.getTime() === target.getTime()) return 0;
    const sign   = target > ref ? 1 : -1;
    let   count  = 0;
    const cursor = new Date(ref);
    while (sign === 1 ? cursor < target : cursor > target) {
        if (!isWeekend(cursor)) count += sign;
        cursor.setDate(cursor.getDate() + sign);
    }
    return count;
}

function getWeekdayCycleKey(date, referenceDate, weekdayCycle) {
    if (isWeekend(date)) return 'W';
    const diff = weekdayDiff(referenceDate, date);
    const len  = weekdayCycle.length;
    return weekdayCycle[((diff % len) + len) % len].toUpperCase();
}

function getPatternKey(date, referenceDate, pattern) {
    const ref  = dateMidnight(referenceDate);
    const tgt  = dateMidnight(date);
    const diff = Math.round((tgt - ref) / MS_PER_DAY);
    const len  = pattern.length;
    return pattern[((diff % len) + len) % len].toUpperCase();
}

function getShiftKey(date, cfg) {
    if (cfg.type === 'weekday_cycle') {
        return getWeekdayCycleKey(date, cfg.referenceDate, cfg.weekdayCycle);
    }
    return getPatternKey(date, cfg.referenceDate, cfg.pattern);
}

// ─── Vacation helpers ─────────────────────────────────────────────────────────

function buildVacationSet(entries) {
    const set = new Set();
    if (!Array.isArray(entries)) return set;
    for (const e of entries) {
        if (e.date) {
            set.add(e.date.slice(0, 10));
        } else if (e.from && e.to) {
            const from = dateMidnight(e.from);
            const to   = dateMidnight(e.to);
            const cur  = new Date(from);
            while (cur <= to) {
                set.add(cur.toISOString().slice(0, 10));
                cur.setDate(cur.getDate() + 1);
            }
        }
    }
    return set;
}

function isVacationDay(date, vacSet) {
    return vacSet.has(new Date(date).toISOString().slice(0, 10));
}

// ─── Countdown helpers ────────────────────────────────────────────────────────

function minutesUntilEnd(shiftDef, now) {
    if (!shiftDef || !shiftDef.end) return null;
    const t      = parseTime(shiftDef.end);
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

// ─── Smart scheduling – feuert exakt zu Schichtgrenzen ───────────────────────

function nextTriggerMs(cfg, now) {
    const candidates = [];

    // Mitternacht (Datumswechsel)
    const midnight = dateMidnight(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setSeconds(5);
    candidates.push(midnight);

    // Alle Schichtstart/Schichtende-Zeiten heute + morgen
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
        const base = new Date(now);
        base.setDate(now.getDate() + dayOffset);
        base.setHours(0, 0, 0, 0);
        for (const def of Object.values(cfg.shiftTypes)) {
            for (const t of [def.start, def.end]) {
                if (!t) continue;
                const p   = parseTime(t);
                const cnd = new Date(base);
                cnd.setHours(p.h, p.m, 5, 0);
                if (cnd > now) candidates.push(cnd);
            }
        }
    }

    candidates.sort((a, b) => a - b);
    const ms = candidates[0] ? candidates[0] - now : 15 * 60 * 1000;
    return Math.max(30 * 1000, Math.min(ms, 15 * 60 * 1000));
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

class Schichtplan extends utils.Adapter {

    constructor(options) {
        super({ ...options, name: 'schichtplan' });
        this.on('ready',  this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
        this._timer       = null;
        this._cfg         = null;
        this._vacationSet = new Set();
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onReady() {
        this.log.info('Schichtplan Adapter gestartet');

        const cfg = this._buildConfig();
        if (!cfg) {
            this.log.error('Ungültige Konfiguration – Adapter stoppt.');
            return;
        }
        this._cfg         = cfg;
        this._vacationSet = buildVacationSet(this.config.vacationEntries || []);

        await this._ensureObjects();
        await this._updateAllStates();
        await this.setStateAsync('info.connection', true, true);
        this._scheduleNextUpdate();
    }

    onUnload(callback) {
        if (this._timer) clearTimeout(this._timer);
        callback();
    }

    // ── Konfiguration aufbauen ────────────────────────────────────────────────

    _buildConfig() {
        const raw = this.config;
        let cfg   = {};

        if (raw.preset === 'custom') {
            const pattern = (raw.customPattern || '').toUpperCase().trim();
            if (!pattern) {
                this.log.error('Benutzerdefiniertes Schichtmuster ist leer!');
                return null;
            }
            cfg.type       = 'pattern';
            cfg.pattern    = pattern;
            cfg.shiftTypes = {};

            for (const def of (raw.customShiftDefs || [])) {
                const key = (def.key || '').toUpperCase().trim();
                if (!key) continue;
                cfg.shiftTypes[key] = {
                    label: def.label || key,
                    start: def.start || null,
                    end:   def.end   || null,
                    color: def.color || '#6b7280',
                };
            }
            // Fallback für undefinierte Buchstaben im Muster
            for (const ch of pattern) {
                if (!cfg.shiftTypes[ch]) {
                    cfg.shiftTypes[ch] = { label: ch, start: null, end: null, color: '#6b7280' };
                }
            }
        } else {
            const preset     = PRESETS[raw.preset] || PRESETS['3schicht_21'];
            cfg.type         = preset.type;
            cfg.pattern      = preset.pattern      || null;
            cfg.weekdayCycle = preset.weekdayCycle || null;
            cfg.shiftTypes   = preset.shiftTypes;
        }

        cfg.referenceDate = raw.referenceDate || new Date().toISOString().slice(0, 10);
        return cfg;
    }

    // ── Objekte anlegen ───────────────────────────────────────────────────────

    async _ensureObjects() {
        // Channels
        for (const ch of ['info', 'current', 'tomorrow', 'dayAfterTomorrow', 'next', 'week', 'meta']) {
            await this.setObjectNotExistsAsync(ch, {
                type:   'channel',
                common: { name: ch },
                native: {},
            });
        }

        // Helper: State anlegen falls nicht vorhanden
        const s = (id, name, type, role, extra = {}) =>
            this.setObjectNotExistsAsync(id, {
                type:   'state',
                common: {
                    name, type, role,
                    read:  true,
                    write: false,
                    def:   type === 'boolean' ? false : (type === 'number' ? 0 : ''),
                    ...extra,
                },
                native: {},
            });

        // ── current ──────────────────────────────────────────────────────────
        await s('current.shiftKey',        'Aktuelle Schicht (Kürzel)',       'string',  'text');
        await s('current.shiftLabel',      'Aktuelle Schicht (Name)',          'string',  'text');
        await s('current.shiftColor',      'Schichtfarbe (Hex)',               'string',  'text');
        await s('current.isFree',          'Heute frei',                       'boolean', 'indicator');
        await s('current.isVacation',      'Heute Urlaub',                     'boolean', 'indicator');
        await s('current.shiftStart',      'Schichtbeginn (HH:MM)',            'string',  'text');
        await s('current.shiftEnd',        'Schichtende (HH:MM)',              'string',  'text');
        await s('current.minutesUntilEnd', 'Minuten bis Schichtende',          'number',  'value', { unit: 'min' });
        await s('current.countdown',       'Countdown bis Schichtende',        'string',  'text');
        await s('current.cycleDay',        'Zyklustag (1-basiert)',            'number',  'value');

        // ── tomorrow ─────────────────────────────────────────────────────────
        await s('tomorrow.shiftKey',       'Schicht morgen (Kürzel)',          'string',  'text');
        await s('tomorrow.shiftLabel',     'Schicht morgen (Name)',             'string',  'text');
        await s('tomorrow.shiftColor',     'Schichtfarbe morgen (Hex)',         'string',  'text');
        await s('tomorrow.isFree',         'Morgen frei',                       'boolean', 'indicator');
        await s('tomorrow.shiftStart',     'Schichtbeginn morgen (HH:MM)',      'string',  'text');
        await s('tomorrow.shiftEnd',       'Schichtende morgen (HH:MM)',        'string',  'text');

        // ── dayAfterTomorrow ──────────────────────────────────────────────────
        await s('dayAfterTomorrow.shiftKey',   'Übermorgen (Kürzel)',           'string',  'text');
        await s('dayAfterTomorrow.shiftLabel', 'Übermorgen (Name)',              'string',  'text');
        await s('dayAfterTomorrow.isFree',     'Übermorgen frei',                'boolean', 'indicator');

        // ── next ─────────────────────────────────────────────────────────────
        await s('next.shiftKey',           'Nächste Schicht (Kürzel)',          'string',  'text');
        await s('next.shiftLabel',         'Nächste Schicht (Name)',             'string',  'text');
        await s('next.shiftStart',         'Nächste Schicht Beginn (HH:MM)',    'string',  'text');
        await s('next.daysUntil',          'Tage bis nächste Schicht',          'number',  'value', { unit: 'days' });

        // ── week ─────────────────────────────────────────────────────────────
        await s('week.json',               '7-Tage-Übersicht (JSON)',           'string',  'json');

        // ── meta ─────────────────────────────────────────────────────────────
        await s('meta.pattern',            'Aktives Schichtmuster',             'string',  'text');
        await s('meta.cycleLength',        'Zykluslänge (Tage)',                'number',  'value');
        await s('meta.lastUpdate',         'Letztes Update (ISO)',              'string',  'text');
    }

    // ── Datenpunkte aktualisieren ─────────────────────────────────────────────

    async _updateAllStates() {
        const now = new Date();
        const cfg = this._cfg;
        const vac = this._vacationSet;

        // Gibt vollständige Schichtinfo für ein Datum zurück
        const infoFor = (date, checkVacation = false) => {
            const key   = getShiftKey(date, cfg);
            const def   = cfg.shiftTypes[key] || {};
            const isVac = checkVacation ? isVacationDay(date, vac) : false;
            return {
                key,
                label:      isVac ? 'Urlaub' : (def.label || key),
                color:      isVac ? '#22c55e' : (def.color || '#6b7280'),
                isFree:     !def.start || isVac,
                isVacation: isVac,
                start:      isVac ? null : (def.start || null),
                end:        isVac ? null : (def.end   || null),
                def,
            };
        };

        const d0 = new Date(now);
        const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
        const d2 = new Date(now); d2.setDate(d2.getDate() + 2);

        const cur = infoFor(d0, true);   // Urlaub nur für heute prüfen
        const tom = infoFor(d1);
        const dat = infoFor(d2);

        // Zyklustag berechnen
        let cycleDay;
        if (cfg.type === 'weekday_cycle') {
            const len = cfg.weekdayCycle.length;
            cycleDay  = ((weekdayDiff(cfg.referenceDate, d0) % len) + len) % len + 1;
        } else {
            const ref  = dateMidnight(cfg.referenceDate);
            const diff = Math.round((dateMidnight(d0) - ref) / MS_PER_DAY);
            const len  = cfg.pattern.length;
            cycleDay   = ((diff % len) + len) % len + 1;
        }

        // Countdown
        const minsEnd   = cur.isFree ? null : minutesUntilEnd(cur.def, now);
        const countdown = cur.isVacation ? 'Urlaub' : cur.isFree ? 'Frei' : formatMinutes(minsEnd);

        // Nächste Arbeitsschicht (Urlaub + Frei werden übersprungen)
        let nextInfo = null, daysUntil = 0;
        for (let i = 1; i <= 60; i++) {
            const d    = new Date(now); d.setDate(now.getDate() + i);
            const info = infoFor(d);
            if (!info.isFree) { nextInfo = info; daysUntil = i; break; }
        }

        // Wochenübersicht (7 Tage, ohne Urlaubsflag)
        const week = [];
        for (let i = 0; i < 7; i++) {
            const d    = new Date(now); d.setDate(now.getDate() + i);
            const info = infoFor(d);
            week.push({
                date:  d.toISOString().slice(0, 10),
                day:   ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()],
                key:   info.key,
                label: info.label,
                start: info.start,
                end:   info.end,
                color: info.color,
                free:  info.isFree,
            });
        }

        const cycleLen = cfg.type === 'weekday_cycle' ? 21 : cfg.pattern.length;

        // Alle States schreiben
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
            ['next.shiftKey',              nextInfo ? nextInfo.key            : '-'],
            ['next.shiftLabel',            nextInfo ? nextInfo.label          : '-'],
            ['next.shiftStart',            nextInfo ? (nextInfo.start || '-') : '-'],
            ['next.daysUntil',             daysUntil],
            ['week.json',                  JSON.stringify(week)],
            ['meta.pattern',               cfg.weekdayCycle || cfg.pattern || '-'],
            ['meta.cycleLength',           cycleLen],
            ['meta.lastUpdate',            now.toISOString()],
        ];

        for (const [id, val] of states) {
            await this.setStateAsync(id, val !== undefined && val !== null ? val : '', true);
        }

        this.log.info(
            `Update ✓ | Heute: ${cur.label}${cur.isVacation ? ' 🏖️' : ''} ` +
            `| Morgen: ${tom.label} ` +
            `| Nächste Arbeit in: ${daysUntil}d`
        );
    }

    // ── Smart-Scheduling: feuert exakt zu Schichtgrenzen ─────────────────────

    _scheduleNextUpdate() {
        if (this._timer) clearTimeout(this._timer);
        const ms = nextTriggerMs(this._cfg, new Date());
        this.log.debug(`Nächstes Update in ${Math.round(ms / 1000)}s`);
        this._timer = setTimeout(async () => {
            await this._updateAllStates();
            this._scheduleNextUpdate();
        }, ms);
    }
}

module.exports = (options) => new Schichtplan(options);
