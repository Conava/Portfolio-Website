export type TokenKind = "kw" | "name" | "str" | "num" | "punct" | "plain" | "comment";
export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set([
  "process", "start", "end", "user", "service", "script", "if", "else", "while", "parallel", "form", "goto",
]);
// Keywords that are followed by an element name (not by a block or condition).
const NAMED = new Set(["process", "start", "end", "user", "service", "script", "goto"]);

// comment | string | number | identifier (hyphens allowed) | punctuation | whitespace | anything else
const RE = /(\/\/.*)|("(?:[^"\\]|\\.)*"?)|(\d+(?:\.\d+)?)|([A-Za-z_][\w-]*)|([{}()])|(\s+)|([^\s])/g;

/** Splits BPMNscript source into one token array per line; joining the texts restores the input. */
export function highlight(source: string): Token[][] {
  return source.split("\n").map((line) => {
    const out: Token[] = [];
    const push = (text: string, kind: TokenKind) => {
      const last = out[out.length - 1];
      if (kind === "plain" && last?.kind === "plain") last.text += text;
      else out.push({ text, kind });
    };
    let prevKw = false;
    for (const m of line.matchAll(RE)) {
      const [text, comment, str, num, ident, punct, space] = m;
      if (space) {
        push(text, "plain");
        continue; // whitespace keeps the "just saw a keyword" state
      }
      if (comment) push(text, "comment");
      else if (str) push(text, "str");
      else if (num) push(text, "num");
      else if (punct) push(text, "punct");
      else if (ident) push(text, KEYWORDS.has(text) ? "kw" : prevKw ? "name" : "plain");
      else push(text, "plain");
      prevKw = !!ident && NAMED.has(text);
    }
    return out;
  });
}
