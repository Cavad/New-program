/* Factory defaults: employees from the October example, legend codes, import rules, holidays. */
(function (root) {
  const TS = (root.TS = root.TS || {});

  // Excel theme colours used by the original form (theme index + tint) with their rendered RGB.
  const THEME = {
    weekend: { rgb: '#BDD7EE', excel: { theme: 4, tint: 0.5999938962981048 } },
    hourly: { rgb: '#2F75B5', excel: { theme: 4, tint: -0.249977111117893 } },
    mourning: { rgb: '#A6A6A6', excel: { theme: 0, tint: -0.3499862666707358 } },
    paternity: { rgb: '#ED7D31', excel: { theme: 5, tint: 0 } },
  };

  const CATEGORY_FILL = { office: '#FFFF00', shift: '#00B050', rotation: '#00B0F0' };

  /** Legend codes. `kind`: leave = absence code from the form legend, shift = shift worker codes. */
  function defaultCodes() {
    return [
      { code: 'MC', en: 'Medical Check', az: 'Tibbi müayinə', fill: '#00B050', font: '#000000', kind: 'leave' },
      { code: 'DO', en: 'Day Off', az: 'İstirahət günü', fill: THEME.weekend.rgb, excelFill: THEME.weekend.excel, font: '#000000', kind: 'leave' },
      { code: 'V', en: 'Vacation', az: 'Məzuniyyət', fill: '#FFC000', font: '#000000', kind: 'leave' },
      { code: 'SL', en: 'Sick leave', az: 'Xəstəlik vərəqəsi', fill: '#FFFFFF', font: '#C00000', kind: 'leave' },
      { code: 'BT', en: 'Business trip', az: 'Ezamiyyət', fill: '#FFFF00', font: '#000000', kind: 'leave' },
      { code: 'ML', en: 'Maternity leave', az: 'Analıq məzuniyyəti', fill: '#7CDEF2', font: '#000000', kind: 'leave' },
      { code: 'off', en: 'Unpaid leave', az: 'Ödənişsiz məzuniyyət', fill: '#FF66FF', font: '#000000', kind: 'leave' },
      { code: 'PH', en: 'Public holidays', az: 'Bayram günləri', fill: '#92D050', font: '#000000', kind: 'leave' },
      { code: 'PL', en: 'Paid leave', az: 'Ödənişli məzuniyyət', fill: '#FFCCCC', font: '#000000', kind: 'leave' },
      { code: 'EL', en: 'Education leave', az: 'Təhsil məzuniyyəti', fill: '#FF0000', font: '#000000', kind: 'leave' },
      { code: 'MD', en: 'Mourning Day', az: 'Matəm günü', fill: THEME.mourning.rgb, excelFill: THEME.mourning.excel, font: '#000000', kind: 'leave' },
      { code: 'HL', en: 'Paid hourly leave', az: 'Ödənişli saatlıq icazə', fill: THEME.hourly.rgb, excelFill: THEME.hourly.excel, font: '#FFFFFF', kind: 'leave' },
      { code: 'TR', en: 'Training', az: 'Təlim', fill: '#C00000', font: '#FFFFFF', kind: 'leave' },
      { code: 'AM', en: 'Paternity Leave', az: 'Atalıq məzuniyyəti', fill: THEME.paternity.rgb, excelFill: THEME.paternity.excel, font: '#000000', kind: 'leave' },
      // Shift worker codes (rows 12-22 in the example)
      { code: '1st', en: '1st shift 07:30-19:30', az: '1-ci növbə 07:30-19:30', fill: '#00B0F0', font: '#000000', kind: 'shift' },
      { code: '2nd', en: '2nd shift 19:30-07:30', az: '2-ci növbə 19:30-07:30', fill: '#7B7B7B', font: '#000000', kind: 'shift' },
      { code: 'N', en: 'Night shift', az: 'Gecə növbəsi', fill: '#4472C4', font: '#FFFFFF', kind: 'shift' },
      { code: 'OFF', en: 'Rest day (shift)', az: 'İstirahət (növbə)', fill: '#FFFFFF', font: '#000000', kind: 'shift' },
    ];
  }

  // [№, SAP, name, position, category, group]
  const EMPLOYEES = [
    [10009, 'Nəbiyev Qulu', 'Logistics Line Manager', 'office'],
    [10987, 'Əliyev Tural', 'Railway Line Manager', 'office'],
    [10643, 'Həmidov Orxan', 'Logistics Team Lead', 'office'],
    [11266, 'İslamzadə Səddam', 'Senior Customs Declarant', 'office'],
    [10638, 'Rüstəmov Nazim', 'Senior Customs Declarant', 'office'],
    [11348, 'Şeyxli Nəzrin', 'Customs Declarant', 'office'],
    [10806, 'Salahov Tural', 'Customs Declarant', 'office'],
    [11304, 'Qasımlı Fuad', 'Customs Declarant', 'office'],
    [11668, 'Cəfərov Emil', 'Customs Declarant', 'office'],
    [10634, 'Kərimov Namiq', 'Customs Declarant', 'office'],
    [11385, 'Əbilov Murad', 'Junior Customs Declarant', 'office'],
    [10765, 'Şəmmədov Samir', 'Night Shift Operator', 'shift'],
    [11093, 'Süleymanov Vəli', 'Night Shift Operator', 'shift'],
    [10615, 'Nəsibov Vüsal', 'Day Shift Operator', 'shift', null, { offAsBlank: true }],
    [11233, 'Muradov Murad', 'Weighbridge Operator', 'shift'],
    [11306, 'Məmmədov Kənan', 'Weighbridge Operator', 'shift'],
    [10807, 'Süleymanov Röyal', 'Weighbridge Operator', 'shift'],
    [11073, 'Rəhimov Şahin', 'Weighbridge Operator', 'shift'],
    [11503, 'Adıgözəlov Nicat', 'Banksman', 'shift'],
    [11358, 'Hüseynov Mahir', 'Banksman', 'shift'],
    [10290, 'Həbibov Elgün', 'Banksman', 'shift'],
    [10625, 'Xubalıyev Ruslan', 'Banksman', 'shift'],
    [11149, 'Eyvazov Ruslan', 'Railway Technician', 'rotation', 'A'],
    [11071, 'Sərxanov Seymur', 'Roustabout', 'rotation', 'A'],
    [10999, 'Allahverdiyev Şahin', 'Roustabout', 'rotation', 'A'],
    [10998, 'Həsənov Eldəniz', 'Roustabout', 'rotation', 'A'],
    [10633, 'Əsədov Vüqar', 'Railway Technician', 'rotation', 'B'],
    [10993, 'Ələkbərov Vahid', 'Roustabout', 'rotation', 'B'],
    [11455, 'Mansurov Ilkin', 'Roustabout', 'rotation', 'B'],
    [11087, 'Nəbiyev Samir', 'Roustabout', 'rotation', 'B'],
  ];

  function defaultEmployees() {
    return EMPLOYEES.map(([sap, name, position, category, group, extra], i) =>
      Object.assign({
        id: 'emp-' + sap,
        sap: String(sap),
        name,
        position,
        category,
        group: group || (category === 'rotation' ? 'A' : ''),
        aliases: [],
        offAsBlank: false,
      }, extra || {}));
  }

  /**
   * Import mappings: a cell text in the shift worker sheet (folded, letters/digits only) -> timesheet value.
   * OP / BY were written as N in the October example; 3RD is the day shift written as 3.
   */
  function defaultImportMap() {
    return { OP: 'N', BY: 'N', NN: 'N', '3RD': 3, ISTIRAHET: 'OFF' };
  }

  /** Fixed-date non-working days in Azerbaijan. Moving holidays (Ramazan, Qurban) must be added yearly. */
  function defaultHolidays() {
    return [
      { date: '01-01', en: 'New Year', az: 'Yeni il', code: 'PH' },
      { date: '01-02', en: 'New Year', az: 'Yeni il', code: 'PH' },
      { date: '01-20', en: 'Day of National Mourning', az: 'Ümumxalq Hüzn Günü', code: 'MD' },
      { date: '03-08', en: "Women's Day", az: 'Qadınlar günü', code: 'PH' },
      { date: '03-20', en: 'Novruz', az: 'Novruz bayramı', code: 'PH' },
      { date: '03-21', en: 'Novruz', az: 'Novruz bayramı', code: 'PH' },
      { date: '03-22', en: 'Novruz', az: 'Novruz bayramı', code: 'PH' },
      { date: '03-23', en: 'Novruz', az: 'Novruz bayramı', code: 'PH' },
      { date: '03-24', en: 'Novruz', az: 'Novruz bayramı', code: 'PH' },
      { date: '05-09', en: 'Victory over Fascism Day', az: 'Faşizm üzərində qələbə günü', code: 'PH' },
      { date: '05-28', en: 'Independence Day', az: 'Müstəqillik günü', code: 'PH' },
      { date: '06-15', en: 'National Salvation Day', az: 'Milli Qurtuluş günü', code: 'PH' },
      { date: '06-26', en: 'Armed Forces Day', az: 'Silahlı Qüvvələr günü', code: 'PH' },
      { date: '11-08', en: 'Victory Day', az: 'Zəfər günü', code: 'PH' },
      { date: '11-09', en: 'National Flag Day', az: 'Dövlət Bayrağı günü', code: 'PH' },
      { date: '12-31', en: 'Solidarity Day', az: 'Həmrəylik günü', code: 'PH' },
    ];
  }

  function defaultSettings() {
    return {
      language: 'en',
      theme: 'light',
      officeHours: 8,
      rotationHours: 12,
      rotationBlock: 2,
      applyHolidays: true,
      department: '',
      fileName: '{Month}_timesheet_Filled',
      shiftNumberFill: '#FFFF00',
      weekendFill: THEME.weekend.rgb,
      rotationDefault: { group: 'A', startDay: 1, oneDay: false },
    };
  }

  function defaultState() {
    return {
      version: 1,
      settings: defaultSettings(),
      employees: defaultEmployees(),
      codes: defaultCodes(),
      importMap: defaultImportMap(),
      holidays: defaultHolidays(),
      months: {},
      templates: {},
    };
  }

  TS.defaults = { THEME, CATEGORY_FILL, defaultCodes, defaultEmployees, defaultImportMap, defaultHolidays, defaultSettings, defaultState };
})(typeof window !== 'undefined' ? window : globalThis);
