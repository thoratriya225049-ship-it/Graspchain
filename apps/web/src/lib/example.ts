import a1 from "../../../../content/articles/A1.json";
import type { StoryExample } from "@/components/fx/ChainFlow";

/**
 * The signed-out home illustrates the chain with real repository content: article A1 and its
 * prepared "clear explanation" demo answer (the same samples demo deployments offer students).
 * The claim and the evidence are exact substrings; the page labels it as an illustration.
 */
const CLAIM_RE = /Because each level depends on the one below[^.]*\./;
const QUOTE_RE = /changing even one character in one record changes that record's hash, every parent hash above it, and finally the root/;

export function homeExample(chainName: string): StoryExample {
  const sample = a1.samples.find((s) => s.label === "Clear explanation")?.text ?? a1.samples[0].text;
  const sentenceIdx = a1.sentences.findIndex((s) => QUOTE_RE.test(s));
  return {
    articleId: a1.id,
    claim: sample.match(CLAIM_RE)?.[0] ?? sample.split(/(?<=\.)\s/)[2] ?? sample,
    sentenceNo: sentenceIdx + 1,
    quote: a1.sentences[sentenceIdx]?.match(QUOTE_RE)?.[0] ?? a1.sentences[4],
    verdict: "Supported",
    rule: "CL-1",
    chainName,
  };
}

export const A1_TITLE = a1.title;
