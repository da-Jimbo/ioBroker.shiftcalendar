# ioBroker Schichtplan Adapter

Flexibler Schichtkalender-Adapter für ioBroker mit Unterstützung für das 21-Tage-Schichtmodell, frei konfigurierbaren Mustern und Urlaubsverwaltung.

---

## Installation

```bash
cd /opt/iobroker
npm install iobroker.schichtplan
iobroker add schichtplan
```

Oder über den ioBroker Admin → Adapter → `schichtplan` suchen und installieren.

---

## Konfiguration

### Tab: Allgemein

| Feld | Beschreibung |
|------|-------------|
| **Schichtmodell** | Wähle ein fertiges Modell oder „Benutzerdefiniert" |
| **Referenzdatum** | Der erste Tag deines Zyklus (Format `YYYY-MM-DD`). Beim 21-Tage-Modell: der erste **Montag der Nachtschichtwoche**. Leer lassen = heutiges Datum. |

### Tab: Benutzerdefiniert

Nur sichtbar wenn „Benutzerdefiniert" gewählt. Gib dein Muster ein (z.B. `FFSSNNXX`) und definiere für jeden Buchstaben eine Schicht mit Name, Start-, Endzeit und Farbe.

### Tab: Urlaub

Trage einzelne Tage (`YYYY-MM-DD`) oder Zeiträume (Von/Bis) ein. Nach Änderungen muss der Adapter neu gestartet werden.

---

## Verfügbare Schichtmodelle

| Modell | Muster | Beschreibung |
|--------|--------|-------------|
| **3-Schicht 21-Tage** | NNNNN-WE-SSSSS-WE-FFFFF-WE | Klassisches Dreischichtmodell, Wochenenden immer frei |
| **3-Schicht** | FFSSNNXX | Rollierende 8-Tage-Zyklen |
| **2-Schicht** | FFSSXX | Früh/Spät mit Freitag |
| **4-Schicht** | FSNX | Kontinuierlicher Betrieb |
| **Wechselschicht** | FNXX | Früh/Nacht im Wechsel |

---

## Datenpunkte (`schichtplan.0.*`)

### current.*

| Datenpunkt | Typ | Beschreibung |
|-----------|-----|-------------|
| `shiftKey` | string | Schichtkürzel (F / S / N / W / X) |
| `shiftLabel` | string | Schichtname (z.B. „Frühschicht") |
| `shiftColor` | string | Farbe als Hex (z.B. `#f59e0b`) |
| `isFree` | boolean | `true` wenn heute frei (Wochenende, Frei-Tag oder Urlaub) |
| `isVacation` | boolean | `true` wenn heute ein Urlaubstag ist |
| `shiftStart` | string | Schichtbeginn z.B. `06:00` |
| `shiftEnd` | string | Schichtende z.B. `14:00` |
| `minutesUntilEnd` | number | Verbleibende Minuten bis Schichtende |
| `countdown` | string | Lesbarer Countdown z.B. `3h 22m` |
| `cycleDay` | number | Aktuelle Position im Zyklus (1-basiert) |

### tomorrow.* / dayAfterTomorrow.*

Gleiche Struktur wie `current`, jedoch ohne `isVacation`, `minutesUntilEnd`, `countdown` und `cycleDay`.

### next.*

Nächste **Arbeitsschicht** (Frei-Tage und Urlaub werden übersprungen).

| Datenpunkt | Beschreibung |
|-----------|-------------|
| `shiftKey` | Kürzel der nächsten Schicht |
| `shiftLabel` | Name der nächsten Schicht |
| `shiftStart` | Beginn der nächsten Schicht |
| `daysUntil` | Tage bis zur nächsten Schicht |

### week.json

JSON-Array mit den nächsten 7 Tagen:

```json
[
  {
    "date": "2025-07-14",
    "day": "Mo",
    "key": "N",
    "label": "Nachtschicht",
    "start": "22:00",
    "end": "06:00",
    "color": "#8b5cf6",
    "free": false
  }
]
```

### meta.*

| Datenpunkt | Beschreibung |
|-----------|-------------|
| `pattern` | Aktives Muster (z.B. `NNNNNSSSSSFFFFFF`) |
| `cycleLength` | Zykluslänge in Tagen |
| `lastUpdate` | ISO-Zeitstempel des letzten Updates |

---

## Scheduling

Der Adapter läuft als `daemon` und feuert Updates **exakt zu Schichtbeginn und Schichtende** (± 5 Sekunden). Zusätzlich wird bei Mitternacht (Datumswechsel) aktualisiert. Fallback: alle 15 Minuten.

---

## Lizenz

MIT
