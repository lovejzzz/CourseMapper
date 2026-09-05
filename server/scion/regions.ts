// Google API availability and unpaid-client restrictions, checked 2026-09-05.
// https://ai.google.dev/gemini-api/docs/available-regions
// https://ai.google.dev/gemini-api/terms
// ISO 3166-1 alpha-2, with XK for Kosovo. Unknown regions fail closed.
const supported = new Set(
  `AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BE BZ BJ BM BT BO BA BW BR IO VG BN BG BF BI CV KH CM CA BQ KY CF TD CL CX CC CO KM CK CR CI HR CW CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF GA GM GE DE GH GI GR GL GD GU GT GG GN GW GY HT HM HN HU IS IN ID IQ IE IM IL IT JM JP JE JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MS MA MZ NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA CY CG RO RW RE BL SH KN LC PM VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA GS KR SS ES LK SD SR SE CH TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY VI UZ VU VA VE VN WF EH YE ZM ZW AX`.split(
    ' ',
  ),
);
const paidRequired = new Set(
  `AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH GB AX GF RE`.split(' '),
);
export function freeRegionAllowed(country: string | undefined): boolean {
  return Boolean(country && supported.has(country) && !paidRequired.has(country));
}
