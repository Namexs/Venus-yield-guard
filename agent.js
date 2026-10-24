// Venus Yield Guard — a small yield agent for BNB Smart Chain Testnet (chain 97).
// It keeps part of its tBNB supplied to the Venus Core Pool vBNB market, sizes that
// share by the live supply APY, and harvests accrued interest once per run.
// Testnet only. The agent wallet holds valueless tBNB; no user funds are touched.
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const RPC = process.env.RPC || 'https://bsc-testnet-rpc.publicnode.com';
const VBNB = '0x2E7222e51c0f6e98610A1543Aa3836E092CDe62c'; // Venus Core vBNB, BSC testnet
const GAS_RESERVE = ethers.parseEther('0.005');            // never supply this part
const DRY = process.argv.includes('--dry');
const DIR = __dirname;

const ABI = [
  'function mint() payable',
  'function redeem(uint256) returns (uint256)',
  'function redeemUnderlying(uint256) returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function balanceOfUnderlying(address) returns (uint256)',
  'function exchangeRateStored() view returns (uint256)',
  'function supplyRatePerBlock() view returns (uint256)',
  'function blocksOrSecondsPerYear() view returns (uint256)',
];

// Policy: target share of capital supplied, by supply APY.
function targetShare(apy) {
  if (apy >= 3) return 0.8;
  if (apy >= 0.5) return 0.5;
  return 0; // below floor: exit
}

function readJSON(f, d) { try { return JSON.parse(fs.readFileSync(path.join(DIR, f))); } catch { return d; } }

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC, 97);
  const key = fs.readFileSync(path.join(DIR, '.agent-key'), 'utf8').trim();
  const wallet = new ethers.Wallet(key, provider);
  const v = new ethers.Contract(VBNB, ABI, wallet);
  const me = wallet.address;

  let perYear;
  try { perYear = Number(await v.blocksOrSecondsPerYear()); } catch { perYear = 365 * 24 * 3600 / 0.75; }
  const rate = await v.supplyRatePerBlock();
  const apy = (Math.pow(1 + Number(rate) / 1e18, perYear) - 1) * 100;

  const cash = await provider.getBalance(me);
  const vBal = await v.balanceOf(me);
  const exRate = await v.exchangeRateStored();
  const supplied = vBal * exRate / 10n ** 18n;
  const capital = cash + supplied - GAS_RESERVE > 0n ? cash + supplied - GAS_RESERVE : 0n;
  const share = targetShare(apy);
  const target = capital * BigInt(Math.round(share * 1000)) / 1000n;

  const state = readJSON('state.json', { principal: '0', actions: [] });
  let principal = BigInt(state.principal);
  let action = null, reason = '';

  const band = capital / 20n; // 5% band
  if (supplied + band < target) {
    const amt = target - supplied;
    action = { kind: 'supply', amount: amt };
    reason = `APY ${apy.toFixed(2)}% → target ${share * 100}% of capital; supplied below target`;
  } else if (supplied > target + band) {
    const amt = supplied - target;
    action = { kind: 'withdraw', amount: amt };
    reason = `APY ${apy.toFixed(2)}% → target ${share * 100}% of capital; supplied above target`;
  } else if (supplied > principal) {
    const earned = supplied - principal;
    const vTok = earned * 10n ** 18n / exRate;
    if (vTok > 0n) {
      action = { kind: 'harvest', amount: earned, vTokens: vTok };
      reason = `daily harvest of accrued interest (APY ${apy.toFixed(2)}%)`;
    }
  }

  let tx = null;
  if (action && !DRY) {
    if (action.kind === 'supply') { tx = await v.mint({ value: action.amount }); principal += action.amount; }
    else if (action.kind === 'withdraw') { tx = await v.redeemUnderlying(action.amount); principal = principal > action.amount ? principal - action.amount : 0n; }
    else { tx = await v.redeem(action.vTokens); }
    await tx.wait();
  }

  const now = new Date().toISOString();
  const entry = action ? { time: now, kind: action.kind, amountBNB: ethers.formatEther(action.amount), reason, tx: tx ? tx.hash : null } : { time: now, kind: 'hold', reason: `within band (APY ${apy.toFixed(2)}%)` };
  if (!DRY) {
    state.principal = principal.toString();
    state.actions = [entry, ...(state.actions || [])].slice(0, 50);
    fs.writeFileSync(path.join(DIR, 'state.json'), JSON.stringify(state, null, 2));
    const status = {
      agent: 'Venus Yield Guard', category: 'yield', chainId: 97, agentWallet: me, market: VBNB,
      updated: now, supplyAPY: Number(apy.toFixed(4)), targetShare: share,
      walletTBNB: ethers.formatEther(await provider.getBalance(me)),
      suppliedTBNB: ethers.formatEther((await v.balanceOf(me)) * (await v.exchangeRateStored()) / 10n ** 18n),
      recentActions: state.actions.slice(0, 10),
    };
    fs.writeFileSync(path.join(DIR, 'status.json'), JSON.stringify(status, null, 2));
  }
  console.log(JSON.stringify({ apy, cash: ethers.formatEther(cash), supplied: ethers.formatEther(supplied), target: ethers.formatEther(target), entry }, null, 2));
}

main().catch(e => { console.error('ERROR', e.shortMessage || e.message); process.exit(1); });
