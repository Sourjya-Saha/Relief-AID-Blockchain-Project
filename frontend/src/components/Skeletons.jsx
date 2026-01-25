// ================= AMBIENT BACKGROUND WRAPPER =================

export const SkeletonPageWrapper = ({ children }) => (
  <div className="min-h-screen w-full bg-[#0B0F14] text-white relative overflow-hidden">

    {/* Grid */}
    <div
      className="absolute inset-0 opacity-[0.04] pointer-events-none"
      style={{
        backgroundImage: `
          linear-gradient(rgba(6,182,212,0.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6,182,212,0.12) 1px, transparent 1px)
        `,
        backgroundSize: "45px 45px",
      }}
    />

    <div className="relative min-h-screen flex flex-col">
      {children}
    </div>

  </div>
);


// ================= BASE BLOCK =================
export const SkeletonBlock = ({ className = "" }) => (
  <div
    className={`
      relative overflow-hidden rounded-lg
      bg-gradient-to-r from-gray-900/70 via-gray-800/70 to-gray-900/70
      animate-pulse border border-gray-800/60
      ${className}
    `}
  >
    <div
      className="absolute inset-0 -translate-x-full
      animate-[shimmer_2s_infinite]
      bg-gradient-to-r from-transparent via-white/5 to-transparent"
    />
  </div>
);



// ================= HERO =================
export const HeroSkeleton = () => (
  <SkeletonPageWrapper>
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-4xl w-full text-center space-y-8">

        <SkeletonBlock className="h-16 w-3/4 mx-auto" />
        <SkeletonBlock className="h-12 w-2/3 mx-auto" />
        <SkeletonBlock className="h-5 w-1/2 mx-auto" />

        <div className="flex justify-center gap-4 mt-12">
          <SkeletonBlock className="h-12 w-44 rounded-xl" />
          <SkeletonBlock className="h-12 w-44 rounded-xl" />
        </div>

      </div>
    </div>
  </SkeletonPageWrapper>
);



// ================= STATS =================
export const StatCardSkeleton = () => (
  <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 space-y-3">
    <SkeletonBlock className="h-8 w-24" />
    <SkeletonBlock className="h-5 w-36" />
    <SkeletonBlock className="h-4 w-40" />
  </div>
);

export const StatsGridSkeleton = () => (
  <section className="relative pb-20 px-4 sm:px-6">
    <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  </section>
);



// ================= DONATION =================
export const DonationSkeleton = () => (
  <section className="relative py-20 px-4 sm:px-6 border-t border-gray-800/50">
    <div className="max-w-3xl mx-auto bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 space-y-6">

      <SkeletonBlock className="h-6 w-52" />
      <SkeletonBlock className="h-10 w-80" />
      <SkeletonBlock className="h-14 w-full rounded-xl" />
      <SkeletonBlock className="h-12 w-full rounded-xl" />

    </div>
  </section>
);



// ================= PROTOCOL FLOW =================
export const FlowSkeleton = () => (
  <section className="relative py-20 px-4 sm:px-6 border-t border-gray-800/60">
    <div className="max-w-4xl mx-auto space-y-12">

      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col md:flex-row items-center gap-6"
        >
          <SkeletonBlock className="h-16 w-16 rounded-2xl" />
          <SkeletonBlock className="h-28 w-full md:w-[45%] rounded-2xl" />
        </div>
      ))}

    </div>
  </section>
);



// ================= TABLE =================
export const TableSkeleton = () => (
  <SkeletonPageWrapper>

    <div className="flex-1 flex justify-center items-start py-10 sm:py-16 px-4">

      <div className="w-full max-w-7xl">

        <div className="overflow-x-auto rounded-2xl">

          <div className="min-w-[900px] bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800 grid grid-cols-5 gap-4">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-28" />
            </div>

            {/* Rows */}
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="px-6 py-4 grid grid-cols-5 gap-4 border-b border-gray-800/60"
              >
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-6 w-28 rounded-full" />
              </div>
            ))}

          </div>

        </div>

      </div>

    </div>

  </SkeletonPageWrapper>
);







