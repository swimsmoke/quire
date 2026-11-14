import type { ClaimDraft } from "./types";

/** Claims prepared for the owner to open, each with a suggested opening probability (%). */
export const STARTER_CLAIMS: { id: string; prob: number; draft: ClaimDraft }[] = [
  {
    id: "spain-world-cup-2026",
    prob: 85,
    draft: {
      question: "Did Spain win the 2026 FIFA World Cup?",
      subject: "2026 FIFA World Cup",
      category: "sports",
      description: "Whether Spain won the men's World Cup held in the United States, Canada and Mexico in June and July 2026.",
      resolutionCriteria: "FIFA's official result shows Spain won the final. No if any other team won.",
    },
  },
  {
    id: "gta-vi-release-2026",
    prob: 85,
    draft: {
      question: "Will Grand Theft Auto VI be released by November 30, 2026?",
      subject: "Grand Theft Auto VI",
      category: "culture",
      description: "Whether Rockstar's GTA VI goes on sale on PlayStation 5 and Xbox Series X|S on its announced date, or at least before the month ends.",
      resolutionCriteria: "The game is publicly available to buy and play on either console by November 30, 2026. No if it is delayed past that date.",
    },
  },
  {
    id: "avengers-doomsday-1-5b",
    prob: 45,
    draft: {
      question: "Will Avengers: Doomsday gross more than $1.5 billion worldwide by June 30, 2027?",
      subject: "Avengers: Doomsday",
      category: "culture",
      description: "Whether Marvel's next Avengers film earns over $1.5 billion at cinemas worldwide.",
      resolutionCriteria: "Box Office Mojo or The Numbers reports a worldwide gross above $1.5 billion on or before June 30, 2027. No if it is below that on that date.",
    },
  },
  {
    id: "nigeria-grammy-african-2027",
    prob: 35,
    draft: {
      question: "Will a Nigerian artist win Best African Music Performance at the 2027 Grammy Awards?",
      subject: "Grammy Award for Best African Music Performance",
      category: "culture",
      description: "Whether the award at the 69th Grammys goes to a Nigerian lead artist.",
      resolutionCriteria: "The Recording Academy names a recording whose lead artist is Nigerian as the winner. No if anyone else wins.",
    },
  },
  {
    id: "nigeria-election-jan-16-2027",
    prob: 75,
    draft: {
      question: "Will Nigeria's 2027 presidential election be held on January 16, 2027?",
      subject: "2027 Nigerian presidential election",
      category: "politics",
      description: "Whether voting for president takes place on the date INEC set in its revised timetable.",
      resolutionCriteria: "Polls open nationwide on January 16, 2027. No if INEC moves the vote to another date.",
    },
  },
  {
    id: "france-turnout-2027",
    prob: 45,
    draft: {
      question: "Will turnout in the first round of the 2027 French presidential election be above 75%?",
      subject: "2027 French presidential election",
      category: "politics",
      description: "Whether more than three in four registered voters vote in the first round.",
      resolutionCriteria: "France's Interior Ministry reports first-round turnout above 75%. No if it is 75% or lower.",
    },
  },
  {
    id: "arsenal-premier-league-2027",
    prob: 35,
    draft: {
      question: "Will Arsenal win the 2026–27 Premier League?",
      subject: "2026–27 Premier League",
      category: "sports",
      description: "Whether Arsenal finish the English Premier League season as champions.",
      resolutionCriteria: "Arsenal top the final league table. No if any other club wins the title.",
    },
  },
  {
    id: "nigeria-afcon-2027",
    prob: 15,
    draft: {
      question: "Will Nigeria win the 2027 Africa Cup of Nations?",
      subject: "2027 Africa Cup of Nations",
      category: "sports",
      description: "Whether the Super Eagles win AFCON, hosted by Kenya, Uganda and Tanzania.",
      resolutionCriteria: "Nigeria win the final. No if another team wins, or Nigeria don't qualify.",
    },
  },
  {
    id: "btc-100k-mid-2027",
    prob: 35,
    draft: {
      question: "Will Bitcoin trade above $100,000 before July 1, 2027?",
      subject: "Bitcoin",
      category: "crypto",
      description: "Whether Bitcoin returns to six figures within the next seven and a half months.",
      resolutionCriteria: "Bitcoin trades above $100,000 on Coinbase or Binance at any moment before July 1, 2027. No otherwise.",
    },
  },
  {
    id: "eth-3000-q1-2027",
    prob: 30,
    draft: {
      question: "Will Ether trade above $3,000 before March 31, 2027?",
      subject: "Ethereum",
      category: "crypto",
      description: "Whether ETH recovers to $3,000 in the next four and a half months.",
      resolutionCriteria: "ETH trades above $3,000 on Coinbase or Binance at any moment before March 31, 2027. No otherwise.",
    },
  },
];
