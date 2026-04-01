export default function Footer({ businessName, tagline, primaryColor }) {
  return (
    <footer className="py-12 px-6 bg-gray-950 text-gray-400">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <p className="font-bold text-xl text-white mb-1">{businessName}</p>
            <p className="text-sm opacity-70">{tagline}</p>
          </div>

          <div className="flex gap-4">
            <a href="#services" className="text-sm hover:text-white transition-colors duration-300">Services</a>
            <span className="opacity-30">|</span>
            <a href="#about" className="text-sm hover:text-white transition-colors duration-300">About</a>
            <span className="opacity-30">|</span>
            <a href="#contact" className="text-sm hover:text-white transition-colors duration-300">Contact</a>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-800 text-center">
          <p className="text-xs opacity-50">Built with care. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
