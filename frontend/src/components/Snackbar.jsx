import { createContext, useContext, useState, useEffect } from "react";

const SnackbarContext = createContext(null);

export const useSnackbar = () => useContext(SnackbarContext);

export const SnackbarProvider = ({ children }) => {
  const [snack, setSnack] = useState(null);

  const showSnackbar = (message, type = "info") => {
  const safeMessage =
    typeof message === "string"
      ? message
      : message?.message ||
        message?.reason ||
        JSON.stringify(message);

  setSnack({ message: safeMessage, type });
};


  const clearSnackbar = () => setSnack(null);

  useEffect(() => {
    if (!snack) return;
    const t = setTimeout(clearSnackbar, 4500);
    return () => clearTimeout(t);
  }, [snack]);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}

      {/* Snackbar */}
      {snack && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[999]">
          <div
            className={`px-5 py-3 rounded-xl backdrop-blur border shadow-2xl
            flex items-center gap-3 animate-slideUp
            ${
              snack.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : snack.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
            }`}
          >
            <span className="text-lg">
              {snack.type === "success" ? "✓" : snack.type === "error" ? "✕" : "ℹ"}
            </span>
            <p className="font-mono text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[320px]">
  {typeof snack.message === "string"
    ? snack.message
    : JSON.stringify(snack.message)}
</p>

          </div>
        </div>
      )}
    </SnackbarContext.Provider>
  );
};
