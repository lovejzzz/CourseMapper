import english from '../../../benchmarks/classroom/v3/inputs/experiment-dev-01.json';
import chinese from '../../../benchmarks/classroom/v3/inputs/experiment-dev-02.json';

/** Explicit teacher-role fixture, kept out of natural-language input files. */
export function comparisonDesignFixture(zh = false) {
  const packet = structuredClone(zh ? chinese : english);
  const inputs = packet.sources;
  const choices = {
    firstRecord: [0, inputs[0].text],
    secondRecord: [1, inputs[1].text],
    designRecord: [2, inputs[2].text],
    firstTreatment: [0, zh ? '带保温套' : 'water-based ink'],
    secondTreatment: [1, zh ? '不带保温套' : 'gel ink'],
    firstOther: [0, zh ? '40 °C' : '18 °C'],
    secondOther: [1, zh ? '30 °C' : '26 °C'],
    factor: [2, zh ? '保温套' : 'ink formula'],
    otherFactor: [2, zh ? '起始水温' : 'room temperature'],
    unit: [2, zh ? '一只杯子' : 'one card'],
    availableUnits: [2, zh ? '24' : '32'],
    controls: [2, zh ? '相同杯型、每杯200 mL水量和相同室内环境' : 'the same card stock, stamped area and ink volume'],
    outcome: [2, zh ? '十分钟内温度下降值' : 'drying time in seconds'],
    measurement: [
      2,
      zh
        ? '用同一校准规则的温度计记录每杯开始时与十分钟后的摄氏温度，以起始值减去结束值，逐杯保存'
        : 'start timing at stamping, then press a fresh clean test strip lightly at five-second intervals until no ink transfers; record that elapsed time for each card',
    ],
  };
  const bindings = Object.fromEntries(
    Object.entries(choices).map(([name, [index, quote]]) => {
      const start = inputs[index].text.indexOf(quote);
      if (start < 0) throw new Error(`Missing fixture quote ${name}`);
      return [name, { inputId: inputs[index].id, start, end: start + quote.length }];
    }),
  );
  return { objective: packet.objective, inputs, bindings };
}
