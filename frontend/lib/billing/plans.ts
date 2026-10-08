/**
 * The plans, in one place: shown on the onboarding pricing step and the public site.
 *
 * Only the plan *id* is ever sent to the server; it decides what that means (Free → active,
 * paid → pending until a verified payment exists). Prices here are display only — nothing is
 * charged anywhere in the app yet.
 *
 * Paid plans' benefits are not enforced by the app today. Edit `features` to match what you
 * will actually offer before taking payments.
 */
export type PlanId = 'free' | 'pro' | 'premium';

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** In rupees. */
  price: number;
  billing: string;
  tagline: string;
  features: readonly string[];
  recommended?: boolean;
}

export const PLANS: readonly PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    billing: 'Free forever · no card needed',
    tagline: 'Everything you need to get organised.',
    features: [
      'Media library for photos and videos',
      'Documents with in-app PDF and text preview',
      'Nested folders, search and Trash',
      'All games, including Ludo and Snake',
      'All 150 Kid Games with saved progress',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    billing: 'Billed monthly · cancel anytime once live',
    tagline: 'For people who use media_tool every day.',
    features: ['Everything in Free', 'Priority email support', 'Early access to new features', 'Supports ongoing development'],
    recommended: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 119,
    billing: 'Billed monthly · cancel anytime once live',
    tagline: 'The complete media_tool experience.',
    features: ['Everything in Pro', 'Fastest support response', 'First access to new games and tools', 'Help shape the roadmap'],
  },
];

export function planInfo(id: PlanId): PlanInfo {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
}

export function formatPrice(price: number): string {
  return `₹${price}`;
}
