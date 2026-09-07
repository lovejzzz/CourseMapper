// Application-owned wire grammar. It constrains shape and source aliases only;
// the source assessor still owns provenance, exact spans and teaching semantics.
const literal = (text) => JSON.stringify(text);
const key = (name) => `${literal(JSON.stringify(name))} ws ":" ws`;
const object = (fields) => `"{" ws ${fields.map(([name, rule]) => `${key(name)} ${rule}`).join(' ws "," ws ')} ws "}"`;
const nullable = (rule) => `("null" | ${rule})`;

export function comparisonStageGrammar(request, stage, context) {
  if (!Array.isArray(request?.inputs) || !request.inputs.length || request.inputs.length > 8)
    throw new Error('A comparison grammar needs one to eight source records.');
  if (!['resources', 'observations'].includes(stage)) throw new Error('Unknown comparison extraction stage.');
  const aliases = request.inputs
    .map((input, index) => ({ id: `r${index + 1}`, inputId: input.id }))
    .filter((input) => stage !== 'observations' || input.inputId !== context?.designRecord?.inputId)
    .map(({ id }) => literal(JSON.stringify(id)));
  if (!aliases.length) throw new Error('The observation stage needs an observation source.');
  let root;
  if (stage === 'resources') {
    const fields = ['factor', 'otherFactor', 'unit', 'availableUnits', 'controls', 'measurement', 'outcome'];
    root = object([
      [
        'newTest',
        nullable(
          object([
            ['source', 'source'],
            ...fields.map((name) => [name, name === 'availableUnits' ? '(phrase | count)' : 'phrase']),
          ]),
        ),
      ],
      ['unknowns', 'unknowns'],
    ]);
  } else {
    const names = [context?.factor?.quote, context?.otherFactor?.quote];
    if (names.some((name) => typeof name !== 'string' || !name.trim() || name.length > 6000) || names[0] === names[1])
      throw new Error('The observation grammar needs two distinct factor names.');
    const group = nullable(
      object([
        ['source', 'source'],
        ['settings', object(names.map((name) => [name, 'phrase']))],
      ]),
    );
    root = object([
      ['firstObservation', group],
      ['secondObservation', group],
      ['unknowns', 'unknowns'],
    ]);
  }
  return [
    `root ::= ${root}`,
    `source ::= ${aliases.join(' | ')}`,
    `phrase ::= "null" | string | ${object([
      ['quote', 'string'],
      ['match', 'positive'],
    ])}`,
    'count ::= "0" | [1-9] [0-9]{0,8}',
    'positive ::= [1-9] [0-9]{0,5}',
    'unknowns ::= "[" ws (string (ws "," ws string){0,7})? ws "]"',
    String.raw`string ::= "\"" character+ "\""`,
    String.raw`character ::= [^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})`,
    String.raw`ws ::= [ \t\n\r]{0,4}`,
  ].join('\n');
}
