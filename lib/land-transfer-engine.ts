// Multi-province land transfer tax, PST on mortgage insurance, and ancillary closing costs.
// Ontario and Toronto validated to the cent. Other provinces use current published rates.
// Quebec/Montreal (indexed annually) and Nova Scotia (municipal, defaulted to Halifax)
// should be re-verified against the official provincial source before heavy client use.

export type Location =
  | 'on-toronto' | 'on' | 'bc' | 'qc-montreal' | 'qc'
  | 'ab' | 'mb' | 'sk' | 'ns-halifax' | 'nb' | 'pei' | 'nl';

type Band = [number, number, number]; // [lowerBound, upperBound, rate]

const ON_BANDS: Band[] = [[0,55000,0.005],[55000,250000,0.01],[250000,400000,0.015],[400000,2000000,0.02],[2000000,Infinity,0.025]];
const TO_BANDS: Band[] = [[0,55000,0.005],[55000,250000,0.01],[250000,400000,0.015],[400000,2000000,0.02],[2000000,3000000,0.025],[3000000,4000000,0.035],[4000000,5000000,0.045],[5000000,10000000,0.055],[10000000,20000000,0.065],[20000000,Infinity,0.075]];
const BC_BANDS: Band[] = [[0,200000,0.01],[200000,2000000,0.02],[2000000,3000000,0.03],[3000000,Infinity,0.05]];
const MB_BANDS: Band[] = [[0,30000,0],[30000,90000,0.005],[90000,150000,0.01],[150000,200000,0.015],[200000,Infinity,0.02]];
const QC_BANDS: Band[] = [[0,58900,0.005],[58900,294600,0.01],[294600,Infinity,0.015]];
const QC_MTL_BANDS: Band[] = [[0,58900,0.005],[58900,294600,0.01],[294600,552300,0.015],[552300,1104700,0.02],[1104700,2136500,0.025],[2136500,3113000,0.03],[3113000,Infinity,0.035]];

function ladder(amount: number, bands: Band[]): number {
  let t = 0;
  for (const [lo, hi, rate] of bands) if (amount > lo) t += (Math.min(amount, hi) - lo) * rate;
  return t;
}

// PST charged on the CMHC premium at closing (not financed). Ontario 8%, Quebec 9%, Saskatchewan 6%.
export function pstRateOnInsurance(loc: Location): number {
  if (loc === 'on-toronto' || loc === 'on') return 0.08;
  if (loc === 'qc-montreal' || loc === 'qc') return 0.09;
  if (loc === 'sk') return 0.06;
  return 0;
}

export interface LttLine { label: string; amount: number; rebate: boolean; }
export interface LttResult { lines: LttLine[]; total: number; }

export function computeLandTransfer(
  loc: Location,
  price: number,
  mortgage: number,
  ftb: boolean,
  newBuild: boolean
): LttResult {
  const lines: LttLine[] = [];
  let total = 0;
  const add = (label: string, amount: number) => { lines.push({ label, amount, rebate: false }); total += amount; };
  const rebate = (label: string, amount: number) => {
    if (amount > 0) { lines.push({ label, amount: -amount, rebate: true }); total -= amount; }
  };

  switch (loc) {
    case 'on-toronto': {
      const p = ladder(price, ON_BANDS);
      const m = ladder(price, TO_BANDS);
      add('Ontario land transfer tax', p);
      if (ftb) rebate('Ontario first-time buyer rebate', Math.min(p, 4000));
      add('Toronto municipal LTT', m);
      if (ftb) rebate('Toronto first-time buyer rebate', Math.min(m, 4475));
      break;
    }
    case 'on': {
      const p = ladder(price, ON_BANDS);
      add('Ontario land transfer tax', p);
      if (ftb) rebate('Ontario first-time buyer rebate', Math.min(p, 4000));
      break;
    }
    case 'bc': {
      const p = ladder(price, BC_BANDS);
      add('BC property transfer tax', p);
      if (ftb && price <= 835000) rebate('BC first-time buyer exemption', p);
      else if (newBuild && price <= 1100000) rebate('BC newly built home exemption', p);
      break;
    }
    case 'mb': add('Manitoba land transfer tax', ladder(price, MB_BANDS)); break;
    case 'qc-montreal': add('Montreal welcome tax', ladder(price, QC_MTL_BANDS)); break;
    case 'qc': add('Quebec welcome tax', ladder(price, QC_BANDS)); break;
    case 'ab':
      add('Alberta title registration fee', 50 + 5 * Math.ceil(price / 5000));
      add('Alberta mortgage registration fee', 50 + 5 * Math.ceil(mortgage / 5000));
      break;
    case 'sk': add('Saskatchewan title transfer fee', price * 0.003); break;
    case 'ns-halifax': add('Nova Scotia deed transfer tax (Halifax)', price * 0.015); break;
    case 'nb': add('New Brunswick land transfer tax', price * 0.01); break;
    case 'pei': {
      const p = price * 0.01;
      add('PEI real property transfer tax', p);
      if (ftb) rebate('PEI first-time buyer exemption', p);
      break;
    }
    case 'nl': add('Newfoundland registration fee', 100 + Math.max(0, price - 500) * 0.004); break;
  }

  return { lines, total };
}

export interface Ancillary {
  appraisal: number;
  inspection: number;
  legal: number;
  title: number;
  moving: number;
  adjustments: number;
  lenderFee: number;
  brokerageFee: number;
}

export function sumAncillary(a: Ancillary): number {
  return a.appraisal + a.inspection + a.legal + a.title + a.moving + a.adjustments + a.lenderFee + a.brokerageFee;
}
