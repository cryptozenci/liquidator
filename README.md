# Kujira Liquidator Bot

Liquidations for Kujira's USK Stablecoin will be connected to the Kujira on-chain scheduler in order to automate liquidations of under-collateralized positions. This liquidation bot is for use during the testing and early phases of USK development to ensure solvency of the USK collateralized debt positions.

## Getting Started

```
git clone https://github.com/Team-Kujira/liquidator.git

cd liquidator

yarn set version latest # Use yarn berry
yarn

# Configure environment so MNEMONIC, REST_ENDPOINT, RPC_ENDPOINT, MARKET_ADDRESS are available

yarn start
```
