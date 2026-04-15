# ioBroker.shiftcalendar

![Shiftcalendar](admin/shiftcalendar.png)

Ein **hochflexibler Schichtkalender-Adapter für ioBroker**, der nahezu jedes Schichtsystem abbilden kann – von einfachen 2-Schicht-Modellen bis hin zu komplexen, individuell definierten Rotationen.

Der Adapter basiert auf einem frei definierbaren **Pattern-System mit Wiederholung**, wodurch keine festen Zykluslängen (z. B. 21 Tage) mehr notwendig sind.

---

## ✨ Features

* ✅ Frei definierbare Schichtmuster (Pattern-Wiederholung)
* ✅ Unterstützt beliebige Schichtsysteme (2, 3, 4, 5+ Schichten)
* ✅ **Unterschiedliche Arbeitszeiten innerhalb eines Systems möglich** (z. B. andere Schichten am Wochenende oder Sonntag)
* ✅ Benutzerdefinierte Schichten (Name, Zeiten, Farbe)
* ✅ Urlaubs- und Sondertage (inkl. Zeiträume)
* ✅ Automatische Berechnung von aktuellen und zukünftigen Schichten
* ✅ Optimiert für Automationen (Blockly, Skripte, VIS)

---

## 📦 Installation

### Manuell über GitHub

```bash
iobroker add https://github.com/da-Jimbo/ioBroker.shiftcalendar
```

### Oder über den ioBroker Admin

Adapter-Suche öffnen → **"shiftcalendar"** eingeben → installieren

---

## ⚙️ Konfiguration

### 🔹 Tab: Allgemein

| Feld          | Beschreibung                                                      |
| ------------- | ----------------------------------------------------------------- |
| Schichtmodell | Auswahl eines Presets oder „Benutzerdefiniert“                    |
| Referenzdatum | Startpunkt des Zyklus (Format: YYYY-MM-DD). Leer = heutiges Datum |

---

### 🔹 Tab: Benutzerdefiniert

Nur sichtbar bei Auswahl von **„Benutzerdefiniert“**.

Hier definierst du dein eigenes Schichtsystem:

* Pattern (z. B. `FFSSNNXX`)
* Jede Position entspricht einem Tag
* Das Pattern wird automatisch wiederholt

Zusätzlich definierst du die Schichten:

| Feld      | Beschreibung                |
| --------- | --------------------------- |
| Kürzel    | z. B. F, S, N, D, W, X      |
| Name      | z. B. Frühschicht           |
| Startzeit | z. B. 06:00                 |
| Endzeit   | z. B. 14:00                 |
| Farbe     | HEX-Code für Visualisierung |

👉 Die Kürzel sind frei definierbar und nicht fest vorgegeben. Dadurch lassen sich auch unterschiedliche Arbeitszeiten innerhalb eines Zyklus (z. B. am Wochenende) problemlos abbilden.

---

### 🔹 Tab: Urlaub

* Einzelne Tage: `YYYY-MM-DD`
* Zeiträume: Von / Bis

⚠️ Nach Änderungen ist ein **Adapter-Neustart erforderlich**

---

## 🧩 Preset-Schichtmodelle

| Modell         | Pattern    | Beschreibung                            |
| -------------- | ---------- | --------------------------------------- |
| 3-Schicht      | `FFSSNNXX` | Klassischer 8-Tage-Rhythmus             |
| 2-Schicht      | `FFSSXX`   | Früh-/Spätschicht mit freien Tagen      |
| 4-Schicht      | `FSNX`     | Kontinuierlicher Betrieb                |
| Wechselschicht | `FNXX`     | Wechsel zwischen Früh- und Nachtschicht |

👉 Alle Modelle basieren auf Pattern-Wiederholung und sind frei anpassbar.

---

## 📊 Datenpunkte (`shiftcalendar.0.*`)

### 🔹 `current.*`

| Datenpunkt      | Typ     | Beschreibung                |
| --------------- | ------- | --------------------------- |
| shiftKey        | string  | Kürzel (F / S / N / X …)    |
| shiftLabel      | string  | Anzeigename                 |
| shiftColor      | string  | HEX-Farbe                   |
| isFree          | boolean | Frei (inkl. Pattern/Urlaub) |
| isVacation      | boolean | Urlaub aktiv                |
| shiftStart      | string  | Startzeit                   |
| shiftEnd        | string  | Endzeit                     |
| minutesUntilEnd | number  | Restzeit in Minuten         |
| countdown       | string  | Lesbarer Countdown          |
| cycleDay        | number  | Position im Pattern         |

---

### 🔹 `tomorrow.*` / `dayAfterTomorrow.*`

Gleiche Struktur wie `current.*`, jedoch ohne:

* isVacation
* minutesUntilEnd
* countdown
* cycleDay

---

### 🔹 `next.*`

Nächste **Arbeits-Schicht** (Frei-Tage und Urlaub werden übersprungen)

| Datenpunkt | Beschreibung                  |
| ---------- | ----------------------------- |
| shiftKey   | Kürzel                        |
| shiftLabel | Name                          |
| shiftStart | Startzeit                     |
| daysUntil  | Tage bis zur nächsten Schicht |

---

### 🔹 `week.json`

JSON-Vorschau der nächsten 7 Tage:

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

---

### 🔹 `meta.*`

| Datenpunkt  | Beschreibung       |
| ----------- | ------------------ |
| pattern     | Aktives Pattern    |
| cycleLength | Länge des Patterns |
| lastUpdate  | ISO-Zeitstempel    |

---

## ⏱ Scheduling

Der Adapter arbeitet ereignisbasiert:

* ⏰ Update bei **Schichtbeginn**
* ⏰ Update bei **Schichtende**
* 🌙 Update bei **Mitternacht**
* 🔁 Fallback: alle 15 Minuten

---

## 🔐 Telemetrie (optional)

Der Adapter enthält eine **DSGVO-konforme, optionale Telemetrie**:

* ❌ Standard: deaktiviert
* ✅ Aktivierung nur per Opt-in
* 📊 Es werden ausschließlich **anonyme technische Daten** übertragen
* 🚫 Keine personenbezogenen Daten

---

## 📄 Lizenz

MIT License
