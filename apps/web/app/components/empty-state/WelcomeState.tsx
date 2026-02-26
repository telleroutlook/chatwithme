import { MessageCircle, Sparkles, Zap, Shield, type LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Sparkles,
    title: 'AI-Powered',
    description: 'Get intelligent responses powered by advanced AI models.',
  },
  {
    icon: Zap,
    title: 'Fast & Responsive',
    description: 'Lightning-fast responses with a smooth user experience.',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your conversations are secure and private.',
  },
  {
    icon: MessageCircle,
    title: 'Natural Conversations',
    description: 'Chat naturally with context-aware understanding.',
  },
];

interface WelcomeStateProps {
  onStartChat?: () => void;
  className?: string;
}

/**
 * WelcomeState component - displayed on first visit to the application.
 * Shows a beautiful welcome screen with feature highlights.
 */
export function WelcomeState({ onStartChat, className = '' }: WelcomeStateProps) {
  return (
    <div
      className={`mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-center px-6 py-12 text-muted-foreground scale-in ${className}`}
    >
      {/* Hero section with gradient background */}
      <div className="relative w-full text-center">
        {/* Background gradient decoration */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
          <div className="h-64 w-64 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent rounded-full blur-3xl" />
        </div>

        {/* Hero content */}
        <div className="relative">
          {/* Icon */}
          <div className="relative mx-auto mb-8 inline-flex">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/15 to-transparent rounded-full blur-2xl animate-pulse" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30 shadow-xl shadow-primary/10">
              <MessageCircle className="h-12 w-12 text-primary" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title and subtitle */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Welcome to
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {' '}
              ChatWithMe
            </span>
          </h1>
          <p className="mx-auto max-w-lg text-base leading-relaxed sm:text-lg">
            Your intelligent conversation companion. Ask questions, explore ideas, and get things
            done with the power of AI.
          </p>

          {/* CTA button */}
          {onStartChat && (
            <button
              onClick={onStartChat}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-smooth hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30 active:scale-95"
            >
              <Sparkles className="h-5 w-5" />
              Start Chatting
            </button>
          )}
        </div>
      </div>

      {/* Features grid */}
      <div className="mt-16 w-full">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-muted/30 p-5 transition-smooth hover:bg-muted/50 hover:border-primary/30"
              style={{
                animationDelay: `${index * 100}ms`,
              }}
            >
              {/* Subtle gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {/* Feature content */}
              <div className="relative">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-smooth group-hover:bg-primary/15 group-hover:ring-primary/30">
                  <feature.icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="mb-1.5 font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-12 flex items-center gap-2 text-sm text-muted-foreground/60">
        <Sparkles className="h-4 w-4" />
        <span>Ready to assist you 24/7</span>
      </div>
    </div>
  );
}
