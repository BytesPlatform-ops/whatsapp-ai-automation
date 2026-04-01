export default function Services({ title, services, primaryColor }) {
  return (
    <section id="services" className="py-24 px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-800 mb-4" style={{ color: primaryColor }}>
            {title}
          </h2>
          <div className="w-16 h-1.5 mx-auto rounded-full" style={{ backgroundColor: primaryColor }} />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {(services || []).map((service, index) => (
            <div
              key={index}
              className="group relative bg-white rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl border border-gray-100"
            >
              {/* Accent top bar */}
              <div
                className="absolute top-0 left-8 right-8 h-1 rounded-b-full transition-all duration-500 group-hover:left-0 group-hover:right-0 group-hover:rounded-none group-hover:rounded-t-2xl"
                style={{ backgroundColor: primaryColor }}
              />

              {/* Number badge */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg mb-6 transition-all duration-500 group-hover:scale-110 group-hover:rounded-2xl"
                style={{ backgroundColor: primaryColor }}
              >
                {String(index + 1).padStart(2, '0')}
              </div>

              <h3 className="text-xl font-700 mb-3 text-gray-900 group-hover:translate-x-1 transition-transform duration-300">
                {service.title}
              </h3>
              <p className="text-gray-500 leading-relaxed">
                {service.description}
              </p>

              {/* Hover arrow */}
              <div className="mt-6 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                  Learn more →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
