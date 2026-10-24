# Venus Yield Guard

A small **yield** agent on **BNB Smart Chain Testnet (chain 97)**, built for BNB Chain's Set and Earn.

- **Registry ID:** _pending — added after ERC-8004 registration_
- **Chain:** 97 (BSC Testnet)
- **ERC-8004 Identity Registry:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Owner (campaign wallet):** `0x6282BAf1Bea98a7fe68493f353A266a986eC65D6`
- **Agent wallet (executes actions):** `0xADf85458babC228aF5B1D7fC3c46623107123e7B`
- **Market:** Venus Core Pool vBNB `0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c`
- **Live status:** [`status.json`](status.json) · **Agent card:** [`agent-card.json`](agent-card.json)

## What it does
1. Reads the live vBNB supply APY.
2. Sets a target share of its capital to supply: 80% at APY ≥ 3%, 50% at ≥ 0.5%, 0% below (exit).
3. If the supplied amount is outside a 5% band, it supplies (`mint()`) or withdraws (`redeemUnderlying`).
4. Otherwise it harvests accrued interest (`redeem`).
5. Publishes every action, its reason and transaction hash to `status.json`.

A 0.005 tBNB gas reserve is never supplied. Testnet only: it holds valueless tBNB and never touches user funds.

## Run
```bash
npm install
node agent.js --dry   # read-only decision
node agent.js         # act (needs .agent-key, never committed)
```
