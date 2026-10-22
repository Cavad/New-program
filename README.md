# Timesheet Studio

Monthly timesheet preparation for the logistics team: office staff, shift workers and the 12-hour rotation crew,
exported into the company's Excel timesheet form.

| File | What it is |
| --- | --- |
| `dist/TimesheetStudio.exe` | **The program (Windows).** Double-click. Opens in its own window, saves everything to files next to the exe, keeps automatic backups. |
| `dist/TimesheetStudio.html` | **Backup / web version.** The same program in one file. Open it in Edge/Chrome/Firefox (works offline), or put it on any web server / intranet / GitHub Pages to use it from the web. Data is kept in that browser. |

Interface languages: **English** (default) and **Azərbaycanca**, with a **day / night** switch in the top bar.

---

## Monthly routine (about 5 minutes)

1. **Pick the month** in the top bar (‹ October 2026 ›).
2. **Office staff (1–11):** every weekday is already 8 h, weekends are empty, public holidays get `PH`.
   Pick a code in the toolbar (Vacation `V`, Sick leave `SL`, Day off `DO`, Hourly leave `HL`, any number of hours …)
   and click or drag over the days, or select cells and just type. *Add absence / range* fills a vacation in one go.
3. **Shift workers (12–22):** drop the Excel file they send onto the import box. The program finds the right month
   in the file (even if the file contains years of months), matches the names (`ROYAL.S` → Süleymanov Röyal),
   converts their notes and shows a preview. Days it cannot be sure about are **left empty, marked with “?”** and
   listed under **Review issues**; click an item to jump to the cell and type the right value.
4. **12-hour rotation (23–30):** choose the group and its first working day this month; tick **“Only 1 day at the
   start”** if that group already worked the last day of the previous month. Both groups are calculated
   (2 days × 12 h on, 2 days off). The next month continues the pattern automatically. Vacations etc. are painted on top.
5. **Export Excel.** The empty form you uploaded for the month is filled (Form ▾ → *Upload empty form for this month*).
   Without an upload, the built-in copy of the form is used, so the export always works.
   The exe saves to the `Timesheets` folder next to it and offers *Open file / Open folder*; the web version downloads the file.

The **Preview** tab shows the finished sheet exactly as it will be exported.

## What the program takes care of

- **Any month:** day columns, weekend shading, title (`Timesheet November 2026`), sheet name, total formulas and the
  date in the signature block are adapted; rows are added or removed for the employee list and the legend and signature
  block move below them. *Note:* the original form's totals only summed days 1–28 (`=SUM(E5:AF5)`); exported files use the full month.
- **Employees are configurable** (Settings → Employees): add, remove, reorder, change SAP / name / position, move
  people between *Office*, *Shift* and *12h rotation*, change rotation groups (also with ⇄ on the rotation tab),
  add extra names used in the shift sheet, and choose “OFF → empty” (as for the day shift operator in the example).
  *Read list from a filled timesheet…* rebuilds the list from any filled form.
- **Shift sheet import** understands (and is tested against every month in the attached file):
  `1st` `2nd` `N` `OFF` `3` (also `1 st`, `1Sst`, `NN`, `3rd`, lower case), `OP`/`BY` → `N`;
  vacation split over cells (`VA` `CA` `Tİ` `ON`, `V` `A` `C` `A` …, `VACA` `TION`, `MƏZUNİYYƏT`, merged cells);
  `SİCK LEAVE` running over the following empty cells, or spelled letter by letter; paternity leave (`ATA LIQ M Ə Z…` → `AM`);
  month labels in Azerbaijani/English/Russian spellings (`OKTYABİR`, `İYUN`, `AVGUST 2024` …); `.xlsx`, `.xls`, `.ods`, `.csv`;
  extra columns such as SAP code or position; headers like `01.10`.
  Anything unclear (typos such as `6ST`, `*`, an `N` right after a vacation word, empty days, unknown words like `ƏLƏT`)
  is **not guessed**: it stays empty with a warning. Recurring words can be taught in *Settings → Import rules*
  (e.g. `ƏLƏT → BT`).
- **Checks before export:** undetermined days, missing import, unknown codes, hours outside 0–24, duplicate SAP codes,
  unequal rotation groups. Exporting with open issues asks for confirmation.
- **Comfort:** undo/redo (Ctrl+Z / Ctrl+Y), copy/paste to and from Excel, right-click menu, keyboard entry, holidays by
  clicking a day header, editable codes and colours, Azerbaijani public holidays pre-filled (add Ramazan/Qurban each year).
- **Backups:** the exe writes `TimesheetStudio-data\state.json` next to itself and keeps an hourly copy in
  `TimesheetStudio-data\backups` (last 60). Settings → *Data & backups* lists them for one-click restore and can download /
  restore a backup file. The web version keeps one copy per day in the browser; download a backup now and then.

## Good to know

- **Windows SmartScreen:** the exe is not code-signed, so the first start may show “Windows protected your PC”.
  Click *More info → Run anyway*.
- The exe needs Microsoft Edge or Google Chrome for its app window (Edge is part of Windows 10/11). If neither is found it
  opens the default browser instead. Closing the window ends the program.
- Keep the exe in a folder you can write to (e.g. Documents or Desktop). If the folder is read-only, the data goes to
  `%APPDATA%\TimesheetStudio` and exports to `Documents\Timesheets`.
- The exe and the HTML file keep separate data. To move data between them use *Download backup* / *Restore from file*.

## Building from source

Needs Node.js 18+ and Go 1.22+.

```
./build.sh          # Linux/macOS: tests, HTML bundle, Windows exe
build.bat           # Windows
```

- `web/src/core` – timesheet logic (shift-sheet parser, rotation, composition, Excel writer); runs in the browser and in Node.
- `web/src/ui` – interface; `web/src/i18n.js` – English/Azerbaijani texts.
- `web/build.mjs` – bundles everything (incl. SheetJS, ExcelJS and the built-in form `web/assets/form_template.xlsx`) into one HTML file.
- `launcher/` – the Go program behind the exe (local web server on 127.0.0.1, app window, file storage, backups).
- `tests/` – `node --test tests/*.test.js` (checks the import against the October example, exports, odd forms and layouts);
  `node tests/e2e/ui.e2e.js` drives the built HTML in Chromium.

---

## Qısa təlimat (Azərbaycanca)

1. `TimesheetStudio.exe` faylını işə salın (və ya `TimesheetStudio.html` faylını brauzerdə açın). Dili yuxarıda **AZ** ilə dəyişin.
2. Ayı seçin. **Ofis işçiləri** üçün iş günləri avtomatik 8 saatdır: yalnız məzuniyyət (`V`), xəstəlik (`SL`), istirahət (`DO`) və s. qeyd edin.
3. **Növbəli işçilər**: onların göndərdiyi Excel faylını idxal sahəsinə atın. Proqramın əmin olmadığı günlər boş qalır, “?” ilə işarələnir və **Problemlərə bax** siyahısında göstərilir.
4. **12 saatlıq növbə**: qrupu və onun bu ayda ilk iş gününü seçin; qrup ötən ayın son günü işləyibsə “Əvvəldə yalnız 1 gün” işarələyin.
5. **Excel-ə çıxar**. Ay üçün boş forma yükləmisinizsə o doldurulur, yoxdursa daxili forma istifadə olunur.

Bütün məlumat avtomatik saxlanılır; ehtiyat nüsxələr *Parametrlər → Məlumat və ehtiyat nüsxələr* bölməsindədir.
