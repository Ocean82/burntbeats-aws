const CheckIcon = () => (
  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const FireIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
    <path d="M12 2C10.5 6 7 8 7 12C7 15.5 9.5 18 12 18C14.5 18 17 15.5 17 12C17 10 16 8 15 6.5C14.5 8 13 9 12 9C11 9 10 8 10 6.5C10 4.5 11 3 12 2Z" fill="url(#fireGradient)" />
    <defs>
      <linearGradient id="fireGradient" x1="12" y1="2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FF6B35" />
        <stop offset="1" stopColor="#F7931E" />
      </linearGradient>
    </defs>
  </svg>
);

const WaveformIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="9" width="2" height="6" rx="1" fill="currentColor" />
    <rect x="6" y="6" width="2" height="12" rx="1" fill="currentColor" />
    <rect x="10" y="3" width="2" height="18" rx="1" fill="currentColor" />
    <rect x="14" y="6" width="2" height="12" rx="1" fill="currentColor" />
    <rect x="18" y="8" width="2" height="8" rx="1" fill="currentColor" />
    <rect x="22" y="10" width="2" height="4" rx="1" fill="currentColor" />
  </svg>
);

interface PricingCardProps {
  name: string;
  price: string;
  period?: string;
  tokens?: string;
  description: string;
  features: string[];
  popular?: boolean;
  accent?: boolean;
}

const PricingCard = ({ name, price, period, tokens, description, features, popular, accent }: PricingCardProps) => (
  <div className={`relative flex flex-col rounded-2xl border ${accent ? 'border-orange-500/50 bg-gradient-to-b from-orange-950/20 to-zinc-900' : 'border-zinc-800 bg-zinc-900/50'} p-8 backdrop-blur-sm transition-all duration-300 hover:border-orange-500/30 hover:shadow-xl hover:shadow-orange-500/5`}>
    {popular && (
      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25">
          <FireIcon />
          Most Popular
        </span>
      </div>
    )}
    
    <div className="mb-6">
      <h3 className="text-xl font-bold text-white mb-2">{name}</h3>
      {tokens && (
        <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-sm text-orange-400 mb-3">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
          {tokens}
        </div>
      )}
      <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
    </div>
    
    <div className="mb-6">
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold text-white">{price}</span>
        <span className="text-zinc-500 text-sm">USD</span>
      </div>
      {period && <span className="text-zinc-500 text-sm">{period}</span>}
    </div>
    
    <ul className="space-y-3 mb-8 flex-grow">
      {features.map((feature, index) => (
        <li key={index} className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <CheckIcon />
          </div>
          <span className="text-zinc-300 text-sm">{feature}</span>
        </li>
      ))}
    </ul>
    
    <button className={`w-full rounded-xl py-3.5 font-semibold transition-all duration-200 ${accent ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25' : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700'}`}>
      {name === 'Top-Up Pack' ? 'Buy Now' : 'Subscribe'}
    </button>
  </div>
);

export default function App() {
  const plans: PricingCardProps[] = [
    {
      name: 'Top-Up Pack',
      price: '$5.00',
      description: 'Pay as you go. Perfect for occasional users who want flexibility without commitment. Purchase anytime, no limits.',
      features: [
        'One-time token purchase',
        'No subscription required',
        'Never expires',
        'Unlimited purchases',
        'Standard processing',
      ],
    },
    {
      name: 'Basic Subscription',
      price: '$9.00',
      period: 'per month',
      tokens: '120 Tokens / month',
      description: 'Essential stem separation for hobbyists and casual creators getting started with audio production.',
      features: [
        '120 credits included monthly',
        'Vocal & Instrumental separation',
        'High-quality stem output',
        'Priority processing queue',
        'Mixer & Editor access',
      ],
    },
    {
      name: 'Premium Monthly',
      price: '$15.00',
      period: 'per month',
      tokens: '300 Tokens / month',
      description: 'Advanced separation for serious producers. Multi-stem isolation with professional mixing capabilities.',
      features: [
        '300 credits included monthly',
        'Multi-stem separation',
        'High-quality output options',
        'Priority processing',
        'Professional mixing tools',
        'Full Mixer & Editor suite',
      ],
      popular: true,
      accent: true,
    },
    {
      name: 'Studio Plan',
      price: '$25.00',
      period: 'per month',
      tokens: '600 Tokens / month',
      description: 'The ultimate toolkit for professionals. Maximum quality, exclusive features, and commercial licensing.',
      features: [
        '600 credits included monthly',
        'Highest quality stem options',
        'Priority queue placement',
        'Bonus tokens awarded regularly',
        'Full Mixer & Editor suite',
        'Beta feature early access',
        'Royalty-free commercial license',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-orange-500/20 rounded-xl blur-lg" />
                <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg">
                  <FireIcon />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">Burnt</span>
                  <span className="text-white">Beats</span>
                </h1>
                <p className="text-xs text-zinc-500 tracking-wider uppercase">AI Stem Separation</p>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-zinc-400 hover:text-white transition-colors text-sm">Features</a>
              <a href="#pricing" className="text-orange-400 font-medium text-sm">Pricing</a>
              <a href="#enterprise" className="text-zinc-400 hover:text-white transition-colors text-sm">Enterprise</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative">
        {/* Hero Section */}
        <section className="py-20 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/20 px-4 py-2 mb-6">
              <WaveformIcon />
              <span className="text-orange-400 text-sm font-medium">Professional Audio Separation</span>
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Choose Your{' '}
              <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 bg-clip-text text-transparent">
                Creative Power
              </span>
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-8">
              Isolate vocals, instruments, drums, and bass with industry-leading AI. 
              Select the plan that matches your production needs.
            </p>
            
            {/* Token Explainer */}
            <div className="inline-flex items-center gap-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
                <span className="text-zinc-300 text-sm">1 Token = 1 Minute of Audio</span>
              </div>
              <div className="w-px h-4 bg-zinc-700" />
              <span className="text-zinc-500 text-sm">Unused tokens roll over monthly</span>
            </div>
          </div>
        </section>

        {/* Pricing Grid */}
        <section className="pb-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              {plans.map((plan, index) => (
                <PricingCard key={index} {...plan} />
              ))}
            </div>
          </div>
        </section>

        {/* Enterprise Section */}
        <section className="pb-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="relative rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900 to-orange-950/20 p-10 lg:p-14 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              <div className="relative grid lg:grid-cols-2 gap-10 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/20 px-3 py-1.5 mb-4">
                    <span className="text-orange-400 text-xs font-semibold uppercase tracking-wider">Enterprise</span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                    Custom Solutions for Teams & Studios
                  </h3>
                  <p className="text-zinc-400 mb-6 leading-relaxed">
                    Need unlimited processing, dedicated infrastructure, or custom integrations? 
                    Our enterprise tier delivers white-glove service with SLA guarantees, 
                    API access, and volume pricing tailored to your organization.
                  </p>
                  <ul className="space-y-3 mb-8">
                    {[
                      'Unlimited stem separations',
                      'Dedicated processing servers',
                      'Custom API integration',
                      'Priority technical support',
                      'Volume discounts',
                      'Custom licensing agreements',
                    ].map((feature, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <CheckIcon />
                        <span className="text-zinc-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors">
                    Contact Sales
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </button>
                </div>
                <div className="hidden lg:flex items-center justify-center">
                  <div className="relative w-64 h-64">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 animate-pulse" />
                    <div className="absolute inset-4 rounded-full bg-gradient-to-br from-orange-500/10 to-amber-500/10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-orange-400">
                        <svg className="w-32 h-32 opacity-50" viewBox="0 0 24 24" fill="none">
                          <path d="M9 19V6l12-3v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="6" cy="19" r="3" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ / Trust Section */}
        <section className="pb-24 px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h3 className="text-2xl font-bold text-white mb-4">Trusted by Producers Worldwide</h3>
            <p className="text-zinc-400 mb-10">
              Join thousands of music creators using Burnt Beats to extract pristine stems for remixes, sampling, and production.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: '500K+', label: 'Tracks Processed' },
                { value: '99.9%', label: 'Uptime SLA' },
                { value: '4.9★', label: 'User Rating' },
                { value: '<30s', label: 'Avg. Processing' },
              ].map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent mb-1">
                    {stat.value}
                  </div>
                  <div className="text-zinc-500 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600">
                <FireIcon />
              </div>
              <span className="font-bold text-white">BurntBeats</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Support</a>
              <span>© 2024 Burnt Beats. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
