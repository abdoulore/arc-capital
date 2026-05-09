// src/App.jsx

import Deposit from "./components/Deposit";
import Withdraw from "./components/Withdraw";
import Dashboard from "./components/Dashboard";

export default function App() {
  const connect = async () => {
    await window.ethereum.request({ method: "eth_requestAccounts" });
  };

  return (
    <div>
      <h1>Vault UI</h1>
      <button onClick={connect}>Connect Wallet</button>

      <Dashboard />
      <Deposit />
      <Withdraw />
    </div>
  );
}