import { teachingArgumentProposalMessages, TEACHING_ARGUMENT_PROPOSAL_PROTOCOL } from './teachingArgumentProposal.js';

const literal = (value) => JSON.stringify(value);
const jsonLiteral = (value) => literal(JSON.stringify(value));
const object = (fields) =>
  `"{" ws ${fields.map(([key, rule]) => `${jsonLiteral(key)} ws ":" ws ${rule}`).join(' ws "," ws ')} ws "}"`;

/** Constrain transport, never truth: selecting a source still requires review.
 * Evidence is the entire selected record, not a model-invented substring.
 */
export function teachingArgumentGrammar(request) {
  teachingArgumentProposalMessages(request);
  const citations = request.inputs.map(({ id, text }) =>
    object([
      ['sourceId', jsonLiteral(id)],
      ['quote', jsonLiteral(text)],
      ['occurrence', '"0"'],
    ]),
  );
  return [
    `root ::= ${object([
      ['protocol', jsonLiteral(TEACHING_ARGUMENT_PROPOSAL_PROTOCOL)],
      ['task', 'string'],
      ['requirements', 'requirements'],
      ['unknowns', 'unknowns'],
    ])}`,
    'requirements ::= "[" ws requirement (ws "," ws requirement){0,2} ws "]"',
    `requirement ::= ${object([
      ['id', 'string'],
      ['action', 'string'],
      ['answer', 'string'],
      ['reasoning', 'reasoning'],
      ['levels', 'levels'],
      ['feedback', 'string'],
    ])}`,
    `reasoning ::= "[" ws ${object([
      ['text', 'string'],
      ['evidence', 'evidence'],
    ])} ws "]"`,
    'evidence ::= "[" ws citation (ws "," ws citation)? ws "]"',
    `citation ::= ${citations.join(' | ')}`,
    `levels ::= ${object(['exemplary', 'proficient', 'developing', 'beginning'].map((name) => [name, 'string']))}`,
    'unknowns ::= "[" ws (string (ws "," ws string){0,7})? ws "]"',
    String.raw`string ::= "\"" character{1,1200} "\""`,
    String.raw`character ::= [^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})`,
    String.raw`ws ::= [ \t\n\r]{0,4}`,
  ].join('\n');
}
