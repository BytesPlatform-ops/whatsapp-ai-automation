export default function Hero({ businessName, headline, tagline, ctaButton, primaryColor, accentColor }) {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center text-white overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 50%, ${accentColor}99 100%)` }}
    >
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10 animate-float" style={{ backgroundColor: accentColor }} />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-10 animate-float delay-300" style={{ backgroundColor: '#fff' }} />
        <div className="absolute top-1/3 right-1/4 w-48 h-48 rounded-full opacity-5 animate-float delay-500" style={{ backgroundColor: accentColor }} />
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30" />

      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
        <div className="animate-fade-in-up opacity-0">
          <span className="inline-block px-5 py-2 text-sm font-semibold tracking-widest uppercase rounded-full glass mb-8">
            {businessName}
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-900 mb-6 leading-[1.1] tracking-tight animate-fade-in-up opacity-0 delay-200">
          {headline}
        </h1>

        <p className="text-lg md:text-xl mb-12 opacity-80 max-w-2xl mx-auto leading-relaxed animate-fade-in-up opacity-0 delay-300">
          {tagline}
        </p>

        <div className="animate-fade-in-up opacity-0 delay-400">
          <a
            href="#contact"
            className="group inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-full transition-all duration-500 hover:scale-105 hover:shadow-2xl animate-pulse-glow"
            style={{ backgroundColor: '#fff', color: primaryColor }}
          >
            {ctaButton}
            <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in opacity-0 delay-600">
        <div className="w-6 h-10 rounded-full border-2 border-white/30 flex justify-center pt-2">
          <div className="w-1.5 h-3 bg-white/60 rounded-full animate-float" />
        </div>
      </div>
    </section>
  );
}
