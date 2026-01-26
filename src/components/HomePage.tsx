export function HomePage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        {/* Illustration SVG */}
        <div className="w-full max-w-md mx-auto">
          <svg
            className="w-full h-auto"
            viewBox="0 0 400 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Sky */}
            <rect width="400" height="300" fill="#f0f9ff" />
            
            {/* Sun */}
            <circle cx="350" cy="50" r="40" fill="#fbbf24" />
            
            {/* Mountains */}
            <path d="M 0 200 L 100 100 L 150 150 L 250 50 L 400 180 L 400 300 L 0 300 Z" fill="#dbeafe" stroke="#3b82f6" strokeWidth="2" />
            
            {/* Paths on mountain (growth lines) */}
            <path d="M 100 100 L 150 150" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
            <path d="M 150 150 L 250 50" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
            <path d="M 250 50 L 350 100" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
            
            {/* Tree (growth/future) */}
            <rect x="50" y="200" width="20" height="40" fill="#92400e" />
            <circle cx="60" cy="180" r="30" fill="#22c55e" />
            
            {/* House/Home (retirement) */}
            <rect x="280" y="190" width="60" height="50" fill="#f97316" />
            <polygon points="280,190 310,160 340,190" fill="#dc2626" />
            <circle cx="295" cy="210" r="5" fill="#1f2937" />
            <rect x="310" y="200" width="15" height="20" fill="#60a5fa" />
            
            {/* Person/Figure on mountain */}
            <circle cx="200" cy="80" r="10" fill="#ec4899" />
            <rect x="195" y="92" width="10" height="20" fill="#ec4899" />
            <circle cx="190" cy="95" r="4" fill="#ec4899" />
            <circle cx="210" cy="95" r="4" fill="#ec4899" />
            
            {/* Arrow showing growth */}
            <path d="M 30 220 L 150 120" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="5,5" opacity="0.6" />
            <polygon points="150,120 145,130 155,125" fill="#8b5cf6" opacity="0.6" />
          </svg>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
            Plan Your Retirement
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Take control of your financial future with tax-optimized projections and insights tailored to your goals.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-8">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="text-3xl mb-2">📊</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Multi-Country Support
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Plan for the US or Canada with country-specific tax rules and benefits.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="text-3xl mb-2">🎯</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Tax-Optimized Strategies
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Minimize your tax burden with intelligent withdrawal strategies.
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="text-3xl mb-2">📈</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              Detailed Projections
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Visualize your savings growth and retirement income year by year.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="pt-4">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Sign up or log in to get started with your retirement planning.
          </p>
        </div>
      </div>
    </main>
  );
}
