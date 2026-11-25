/** The model provider refused the wording. The agent never acted on it. */
export class ContentFilterError extends Error {
  constructor() {
    super("content filter");
    this.name = "ContentFilterError";
  }
}

export const FILTER_MESSAGE =
  "The model provider's content filter refused this wording, so nothing was sent to the chain. Say what to trade in plain words, for example: Buy $500 of tGOLD.";
