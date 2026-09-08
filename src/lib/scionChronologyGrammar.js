export function chronologyBindingsGrammar(inputs) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 8)
    throw new Error('Supply one to eight source records.');
  const literal = (value) => JSON.stringify(JSON.stringify(value));
  const object = (fields) =>
    `"{" ws ${fields.map(([key, rule]) => `${literal(key)} ws ":" ws ${rule}`).join(' ws "," ws ')} ws "}"`;
  return [
    `root ::= ${object([
      ['bindings', 'bindings'],
      ['unknowns', 'unknowns'],
    ])}`,
    `bindings ::= ${object([
      ...['recordDate', 'eventClaim', 'relativeDay', 'recordingDate', 'broadMonth', 'sameEventEvidence'].map((key) => [
        key,
        'phrase',
      ]),
      ['limitRecord', 'record'],
    ])}`,
    `phrase ::= "null" | ${object([
      ['source', 'source'],
      ['quote', 'string'],
      ['occurrence', 'count'],
    ])}`,
    `record ::= "null" | ${object([['source', 'source']])}`,
    `source ::= ${inputs.map((_, i) => literal(`r${i + 1}`)).join(' | ')}`,
    'count ::= "0" | [1-9] [0-9]{0,4}',
    'unknowns ::= "[" ws (string (ws "," ws string){0,7})? ws "]"',
    String.raw`string ::= "\"" character{1,1200} "\""`,
    String.raw`character ::= [^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})`,
    String.raw`ws ::= [ \t\n\r]{0,4}`,
  ].join('\n');
}
