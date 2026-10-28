// Some listed-company EDINET filer codes also file reports for trusts and
// beneficiary securities. Their financial periods are NOT company accounts.
export type EdinetAnnualDocument = {
  docTypeCode: string;
  docDescription?: string | null;
};

export function isCorporateAnnualEdinetDocument(document: EdinetAnnualDocument) {
  if (document.docTypeCode !== "120" && document.docTypeCode !== "130") return false;
  const description = document.docDescription ?? "";
  return !/(?:信託受益証券|受益証券等)/.test(description);
}
