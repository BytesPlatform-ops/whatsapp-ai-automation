export default function Contact({ ctaTitle, ctaText, ctaButton, email, phone, address, primaryColor, accentColor }) {
  return (
    <section
      id="contact"
      className="py-24 px-6 text-white relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 100%)` }}
    >
      {/* Decorative shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full opacity-10" style={{ backgroundColor: accentColor }} />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
      </div>

      <div className="max-w-4xl mx-auto text-center relative z-10">
        <h2 className="text-3xl md:text-5xl font-800 mb-4">{ctaTitle}</h2>
        <p className="text-lg mb-12 opacity-80 max-w-2xl mx-auto">{ctaText}</p>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {email && (
            <a href={`mailto:${email}`} className="group glass rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:bg-white/15">
              <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="font-semibold mb-1">Email</p>
              <p className="opacity-80 text-sm">{email}</p>
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`} className="group glass rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:bg-white/15">
              <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <p className="font-semibold mb-1">Phone</p>
              <p className="opacity-80 text-sm">{phone}</p>
            </a>
          )}
          {address && (
            <div className="group glass rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:bg-white/15">
              <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-white/10 group-hover:bg-white/20 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="font-semibold mb-1">Address</p>
              <p className="opacity-80 text-sm">{address}</p>
            </div>
          )}
        </div>

        <a
          href={`mailto:${email}`}
          className="group inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold rounded-full transition-all duration-500 hover:scale-105 hover:shadow-2xl"
          style={{ backgroundColor: '#fff', color: primaryColor }}
        >
          {ctaButton}
          <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </a>
      </div>
    </section>
  );
}
