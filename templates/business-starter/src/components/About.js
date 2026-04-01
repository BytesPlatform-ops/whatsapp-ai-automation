export default function About({ title, text, primaryColor }) {
  return (
    <section id="about" className="py-24 px-6 relative overflow-hidden">
      {/* Background accent */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5 -translate-y-1/2 translate-x-1/2"
        style={{ backgroundColor: primaryColor }}
      />

      <div className="max-w-5xl mx-auto relative">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Left side - heading */}
          <div>
            <span
              className="inline-block text-sm font-semibold tracking-widest uppercase mb-4"
              style={{ color: primaryColor }}
            >
              Who We Are
            </span>
            <h2 className="text-3xl md:text-5xl font-800 text-gray-900 leading-tight mb-6">
              {title}
            </h2>
            <div className="w-16 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
          </div>

          {/* Right side - content */}
          <div>
            <p className="text-lg text-gray-600 leading-relaxed mb-8">
              {text}
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { number: '100+', label: 'Projects' },
                { number: '50+', label: 'Clients' },
                { number: '5+', label: 'Years' },
              ].map((stat, i) => (
                <div key={i} className="text-center p-4 rounded-xl bg-gray-50">
                  <p className="text-2xl font-800" style={{ color: primaryColor }}>{stat.number}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
