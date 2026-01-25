export const parseTxError = (err) => {
  const msg = err?.message || "";

  if (msg.includes("user rejected"))
    return "Transaction rejected by user";

  if (msg.includes("JSON-RPC"))
    return "Network error: RPC node not responding";

  if (msg.includes("insufficient funds"))
    return "Insufficient balance for gas";

  if (msg.includes("nonce"))
    return "Nonce mismatch. Try again";

  if (msg.includes("execution reverted"))
    return "Smart contract rejected the transaction";

  return "Transaction failed. Please try again";
};
