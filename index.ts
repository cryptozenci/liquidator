import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { tx, registry, query } from "kujira.js/";

const REST_ENDPOINT = process.env.REST_ENDPOINT as string;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT as string;
const MNEMONIC = process.env.MNEMONIC as string;
const MARKET_ADDRESS = process.env.MARKET_ADDRESS as string;
const MARKET_ORACLE_DENOM = process.env.MARKET_ORACLE_DENOM as string;
const MARKET_MAX_LTV = parseFloat(process.env.MARKET_MAX_LTV as string);
const GAS_PRICE = process.env.GAS_PRICE || "0.00125ukuji";

const CLIENT = query({ rest: REST_ENDPOINT });

type Position = {
  owner: string;
  deposit_amount: string;
  mint_amount: string;
  interest_amount: string;
  updated_at: string;
  liquidation_price_cache: string;
};

const YEAR_NANOSECOND = 31_536_000_000_000_000;

const interest = (updated_at: number, mint_amount: number) => {
  const now = new Date().getTime() * 1000000;
  const elapsed = now - updated_at;
  return (mint_amount * elapsed * 0.05) / YEAR_NANOSECOND;
};

const liquidate = async (
  client: SigningStargateClient,
  address: string,
  positions: Position[]
) => {
  const addresses = positions.map((x) => x.owner);
  if (!addresses.length) return;

  const msg = tx.wasm.msgExecuteContract({
    sender: address,
    contract: MARKET_ADDRESS,
    msg: Buffer.from(
      JSON.stringify({
        liquidates: {
          manual: {
            addresses,
          },
        },
      })
    ),
    funds: [],
  });
  try {
    console.debug("Attempting Liquidation");
    console.debug(addresses);

    const res = await client.signAndBroadcast(address, [msg], "auto");
    console.debug(res.transactionHash);
  } catch (e) {
    console.error(e);

    positions.pop();
    await liquidate(client, address, positions);
  }
};

const getpositions = async (
  address: string,
  price: number
): Promise<Position[]> => {
  console.debug("Running " + new Date());

  let candidates: Position[] = [];

  try {
    const { data } = await CLIENT.wasm.queryAllContractState(address, {
      "pagination.limit": "10000",
      "pagination.reverse": true,
    });
    const { models } = data;
    models?.forEach((m) => {
      const v = JSON.parse(
        Buffer.from(m.value || "", "base64").toString("utf-8")
      );
      if (typeof v === "object" && "deposit_amount" in v) {
        const p: Position = v;
        const deposit_amount = parseInt(p.deposit_amount);
        if (!deposit_amount) return;

        const mint_amount = parseInt(p.mint_amount);
        const interest_amount =
          parseInt(p.interest_amount) +
          interest(parseInt(v.updated_at), mint_amount);
        const debt_amount = mint_amount + interest_amount;

        const liqiuidation_price =
          debt_amount / (deposit_amount * MARKET_MAX_LTV);
        if (liqiuidation_price > price) {
          candidates.push(p);
        }
      }
    });
  } catch (e) {
    console.error(e);
  }
  return candidates.reverse();
};

async function run() {
  const price = await CLIENT.oracle.queryExchangeRate(MARKET_ORACLE_DENOM);

  const positions = await getpositions(
    MARKET_ADDRESS,
    parseFloat(price.data.exchange_rate || "0")
  );

  const signer = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: "kujira",
  });
  const accounts = await signer.getAccounts();

  if (positions.length) {
    const client = await SigningStargateClient.connectWithSigner(
      RPC_ENDPOINT,
      signer,
      {
        registry,
        gasPrice: GasPrice.fromString(GAS_PRICE),
      }
    );

    await liquidate(client, accounts[0].address, positions);
  }
  await new Promise((resolve) => setTimeout(resolve, 30000));
  run();
}

run();
