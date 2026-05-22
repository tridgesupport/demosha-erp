export type FieldType = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'checkbox';

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
  colSpan?: 1 | 2;
}

export interface SectionConfig {
  key: string;
  title: string;
  subtitle?: string;
  fields: FormField[];
}

export interface ProductConfig {
  code: string;
  name: string;
  formRef: string;
  sections: SectionConfig[];
}

// ─── SHS — Sodium Hydrosulphite ───────────────────────────────────────────────

const SHS_SECTIONS: SectionConfig[] = [
  {
    key: 'first_reactor',
    title: 'First Reactor',
    subtitle: 'No. 1 / 2',
    fields: [
      { key: 'reactor_no',          label: 'Reactor No.',            type: 'select', options: ['1','2'] },
      { key: 'date',                label: 'Date',                   type: 'date' },
      { key: 'shift',               label: 'Shift',                  type: 'text' },
      { key: 'zinc_dust_charge_kgs',label: 'Zinc Dust Charge (Kgs)', type: 'number' },
      { key: 'so2_started_at',      label: 'SO₂ Started at',         type: 'text' },
      { key: 'so2_quality',         label: 'Quality',                type: 'text' },
      { key: 'water_ltr',           label: 'Water (Ltr)',            type: 'number' },
      { key: 'so2_stopped_at',      label: 'SO₂ Stopped at',         type: 'text' },
      { key: 'chilled_water_temp_c',label: 'Chilled Water Temp (°C)',type: 'number' },
      { key: 'so2_tank_no',         label: 'SO₂ Tank No.',           type: 'text' },
      { key: 'ph_end_point',        label: 'pH @ End Point',         type: 'number' },
      { key: 'reaction_temp_c',     label: 'Reaction Temp (°C)',     type: 'number' },
      { key: 'venting_use',         label: 'Venting Use',            type: 'text' },
      { key: 'water_tds_gm_ltr',    label: 'Water TDS (Gm/Ltr)',     type: 'number' },
      { key: 'zinc_dust_lot_no',    label: 'Zinc Dust Lot No.',      type: 'text' },
      { key: 'solution_colour',     label: 'Solution Colour',        type: 'text' },
      { key: 'remarks',             label: 'Remarks',                type: 'textarea', colSpan: 2 },
    ],
  },
  {
    key: 'anf',
    title: 'ANF',
    subtitle: 'No. 1 / 2',
    fields: [
      { key: 'anf_no',                    label: 'ANF No.',                    type: 'select', options: ['1','2'] },
      { key: 'date',                       label: 'Date',                       type: 'date' },
      { key: 'shift',                      label: 'Shift',                      type: 'text' },
      { key: 'anf_operation_start',        label: 'ANF Operation Start',        type: 'text' },
      { key: 'anf_operation_stopped',      label: 'ANF Operation Stopped',      type: 'text' },
      { key: 'alcohol_used',               label: 'Alcohol Used',               type: 'text' },
      { key: 'wash_alc_ltr',              label: 'Wash Alc. (Ltr)',            type: 'number' },
      { key: 'wash_alc_baume',            label: 'Wash Alc. Baumé',            type: 'number' },
      { key: 'rec_alc_ltr',               label: 'Rec. Alc. (Ltr)',            type: 'number' },
      { key: 'rec_alc_baume',             label: 'Rec. Alc. Baumé',            type: 'number' },
      { key: 'dryer_alc_ltr',             label: 'Dryer Alc. (Ltr)',           type: 'number' },
      { key: 'dryer_alc_baume',           label: 'Dryer Alc. Baumé',           type: 'number' },
      { key: 'fresh_alc_ltr',             label: 'Fresh Alc. (Ltr)',           type: 'number' },
      { key: 'fresh_alc_baume',           label: 'Fresh Alc. Baumé',           type: 'number' },
      { key: 'collect_wash_alcohol',      label: 'Collect Wash Alcohol',       type: 'text' },
      { key: 'material_deep_inches',      label: 'Material Deep (Inches)',      type: 'number' },
      { key: 'final_material_deep_inches',label: 'Final Material Deep (Inches)',type: 'number' },
      { key: 'nutsche_cloth_batch_no',    label: 'Nutsche Cloth for Batch No.', type: 'text' },
      { key: 'soda_ash_add_kg',           label: 'Soda Ash Add (Kg)',          type: 'number' },
      { key: 'remarks',                   label: 'Remarks',                    type: 'textarea', colSpan: 2 },
    ],
  },
  {
    key: 'second_reactor',
    title: 'Second Reactor',
    subtitle: 'No. 1 / 2 / 3',
    fields: [
      { key: 'reactor_no',             label: 'Reactor No.',              type: 'select', options: ['1','2','3'] },
      { key: 'date',                   label: 'Date',                     type: 'date' },
      { key: 'shift',                  label: 'Shift',                    type: 'text' },
      { key: 'baume_of_caustic',       label: 'Baumé of Caustic',         type: 'number' },
      { key: 'temperature_c',          label: 'Temperature (°C)',          type: 'number' },
      { key: 'second_reactor_started', label: 'Second Reactor Started',   type: 'text' },
      { key: 'stopped_at',             label: 'Stopped at',               type: 'text' },
      { key: 'initial_caustic_ltr',    label: 'Initial Caustic (Ltr)',    type: 'number' },
      { key: 'extra_ltr',              label: 'Extra (Ltr)',              type: 'number' },
      { key: 'total_caustic_ltr',      label: 'Total Caustic (Ltr)',      type: 'number' },
      { key: 'temp_before_filtration', label: 'Temp. before Filtration',  type: 'number' },
      { key: 'ph_on_p_paper',          label: 'pH on P. Paper',           type: 'number' },
      { key: 'ph_on_r_paper',          label: 'pH on R. Paper',           type: 'number' },
      { key: 'soda_ash_added',         label: 'Soda Ash Added',           type: 'number' },
      { key: 'receiver_temp_c',        label: 'Receiver Temp (°C)',        type: 'number' },
      { key: 'filtration_started',     label: 'Filtration Started',       type: 'text' },
      { key: 'filtration_stopped_at',  label: 'Filtration Stopped at',    type: 'text' },
      { key: 'filtration_volume_ltr',  label: 'Filtration Volume (Ltr)',  type: 'number' },
      { key: 'total_volume_ltr',       label: 'Total Volume (Ltr)',       type: 'number' },
      { key: 'caustic_added_rec_ltr',  label: 'Caustic Added in Rec. (Ltr)', type: 'number' },
      { key: 'filter_press_no',        label: 'Filter Press No.',         type: 'text' },
      { key: 'receiver_no',            label: 'Receiver No.',             type: 'select', options: ['1','2','3','4'] },
      { key: 'press_cloths_batch_no',  label: 'Press Cloths for Batch No.', type: 'text' },
      { key: 'sparkler_filter_cleaned',label: 'Sparkler Filter Cleaned',  type: 'select', options: ['Yes','No'] },
      { key: 'remarks',                label: 'Remarks',                  type: 'textarea', colSpan: 2 },
    ],
  },
  {
    key: 'dryer',
    title: 'Dryer',
    subtitle: 'At 1 / 2 / 3 / 4 / 5 / 6',
    fields: [
      { key: 'dryer_no',              label: 'Dryer No.',              type: 'select', options: ['1','2','3','4','5','6'] },
      { key: 'date',                  label: 'Date',                   type: 'date' },
      { key: 'shift',                 label: 'Shift',                  type: 'text' },
      { key: 'dryer_water_washed',    label: 'Dryer Water Washed',     type: 'text' },
      { key: 'dryer_vacuum_max_in',   label: 'Dryer Vacuum Max (inches)', type: 'number' },
      { key: 'dryer_vacuum_min_in',   label: 'Dryer Vacuum Min (inches)', type: 'number' },
      { key: 'heating_started_at',    label: 'Heating Started at',     type: 'text' },
      { key: 'heating_temp',          label: 'Heating Temp',           type: 'number' },
      { key: 'heating_stopped_at',    label: 'Heating Stopped at',     type: 'text' },
      { key: 'heating_stopped_temp',  label: 'Heating Stopped Temp',   type: 'number' },
      { key: 'cooling_started_at',    label: 'Cooling Started at',     type: 'text' },
      { key: 'cooling_started_temp',  label: 'Cooling Started Temp',   type: 'number' },
      { key: 'maximum_temp',          label: 'Maximum Temp',           type: 'number' },
      { key: 'cooling_stopped_at',    label: 'Cooling Stopped at',     type: 'text' },
      { key: 'cooling_stopped_temp',  label: 'Cooling Stopped Temp',   type: 'number' },
      { key: 'alcohol_collected_ltr', label: 'Alcohol Collected (Ltr)',type: 'number' },
      { key: 'alcohol_baume',         label: 'Alcohol Baumé',          type: 'number' },
      { key: 'material_with_lumps',   label: 'Material With Lumps',    type: 'text' },
      { key: 'colour_of_material',    label: 'Colour of Material',     type: 'text' },
      { key: 'total_carboys',         label: 'Total Carboys',          type: 'number' },
      { key: 'purity_pct',            label: 'Purity (%)',             type: 'number' },
      { key: 'yield_kgs',             label: 'Yield (Kgs)',            type: 'number' },
      { key: 'yr',                    label: 'Y.R.',                   type: 'number' },
      { key: 'passes_240',            label: '% Passes 240',           type: 'number' },
      { key: 'passes_150',            label: '% Passes 150',           type: 'number' },
      { key: 'operator_sc',           label: 'Sign. of Operator/SC',   type: 'text' },
      { key: 'remarks',               label: 'Remarks',                type: 'textarea', colSpan: 2 },
    ],
  },
  {
    key: 'evaporator',
    title: 'Evaporator',
    subtitle: 'No. IV / V',
    fields: [
      { key: 'evaporator_no',         label: 'Evaporator No.',         type: 'select', options: ['IV','V'] },
      { key: 'date',                  label: 'Date',                   type: 'date' },
      { key: 'shift',                 label: 'Shift',                  type: 'text' },
      { key: 'baume_of_brine',        label: 'Baumé of Brine',         type: 'number' },
      { key: 'total_brine_added',     label: 'Total Brine Added',      type: 'number' },
      { key: 'evaporator_started_at', label: 'Evaporator Started at',  type: 'text' },
      { key: 'completed_at',          label: 'Completed at',           type: 'text' },
      { key: 'temperature_c',         label: 'Temperature (°C)',        type: 'number' },
      { key: 'vacuum_inches_hg',      label: 'Vacuum (inches Hg)',      type: 'number' },
      { key: 'evaporator_level_lit',  label: 'Evaporator Level (Lit)', type: 'number' },
      { key: 'evaporator_wash',       label: 'Evaporator Wash',        type: 'text' },
      { key: 'remarks',               label: 'Remarks',                type: 'textarea', colSpan: 2 },
    ],
  },
];

export const PRODUCT_CONFIGS: Record<string, ProductConfig> = {
  SHS: {
    code: 'SHS',
    name: 'Sodium Hydrosulphite',
    formRef: 'SHSP/F/01/03',
    sections: SHS_SECTIONS,
  },
};

export function getProductConfig(code: string): ProductConfig | null {
  return PRODUCT_CONFIGS[code.toUpperCase()] ?? null;
}
