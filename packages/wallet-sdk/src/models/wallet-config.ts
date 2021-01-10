import { Wallet } from './wallet';
import { Account } from './account';
import { GaiaHubConfig, connectToGaiaHub, uploadToGaiaHub } from '@stacks/storage';
import { decryptContent, encryptContent, getPublicKeyFromPrivate } from '@stacks/encryption';
import { fetchPrivate } from '@stacks/common';

export interface ConfigApp {
  origin: string;
  scopes: string[];
  lastLoginAt: number;
  appIcon: string;
  name: string;
}

export interface ConfigAccount {
  username?: string;
  apps: {
    [origin: string]: ConfigApp;
  };
}

export interface WalletConfig {
  accounts: ConfigAccount[];
  meta?: {
    [key: string]: any;
  };
}

export const createWalletGaiaConfig = async ({
  gaiaHubUrl,
  wallet,
}: {
  gaiaHubUrl: string;
  wallet: Wallet;
}): Promise<GaiaHubConfig> => {
  return connectToGaiaHub(gaiaHubUrl, wallet.configPrivateKey);
};

export const getOrCreateWalletConfig = async ({
  wallet,
  gaiaHubConfig,
  skipUpload,
}: {
  wallet: Wallet;
  gaiaHubConfig: GaiaHubConfig;
  skipUpload?: boolean;
}): Promise<WalletConfig> => {
  const config = await fetchWalletConfig({ wallet, gaiaHubConfig });
  if (config) return config;
  const newConfig: WalletConfig = {
    accounts: wallet.accounts.map(account => ({
      username: account.username,
      apps: {},
    })),
  };
  if (!skipUpload) {
    await updateWalletConfig({ wallet, walletConfig: newConfig, gaiaHubConfig });
  }
  return newConfig;
};

export const fetchWalletConfig = async ({
  wallet,
  gaiaHubConfig,
}: {
  wallet: Wallet;
  gaiaHubConfig: GaiaHubConfig;
}) => {
  try {
    const response = await fetchPrivate(
      `${gaiaHubConfig.url_prefix}${gaiaHubConfig.address}/wallet-config.json`
    );
    if (!response.ok) return null;
    const encrypted = await response.text();
    const configJSON = (await decryptContent(encrypted, {
      privateKey: wallet.configPrivateKey,
    })) as string;
    const config: WalletConfig = JSON.parse(configJSON);
    return config;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateWalletConfig = async ({
  wallet,
  walletConfig,
  gaiaHubConfig,
}: {
  wallet: Wallet;
  walletConfig: WalletConfig;
  gaiaHubConfig: GaiaHubConfig;
}) => {
  const encrypted = await encryptWalletConfig({ wallet, walletConfig });
  await uploadToGaiaHub('wallet-config.json', encrypted, gaiaHubConfig);
};

export const encryptWalletConfig = async ({
  wallet,
  walletConfig,
}: {
  wallet: Wallet;
  walletConfig: WalletConfig;
}) => {
  const publicKey = getPublicKeyFromPrivate(wallet.configPrivateKey);
  const encrypted = await encryptContent(JSON.stringify(walletConfig), { publicKey });
  return encrypted;
};

export const updateWalletConfigWithApp = async ({
  wallet,
  account,
  app,
  gaiaHubConfig,
  walletConfig,
}: {
  wallet: Wallet;
  account: Account;
  app: ConfigApp;
  gaiaHubConfig: GaiaHubConfig;
  walletConfig: WalletConfig;
}) => {
  wallet.accounts.forEach((account, index) => {
    const configApp = walletConfig.accounts[index];
    if (configApp) {
      configApp.apps = configApp.apps || {};
      configApp.username = account.username;
      walletConfig.accounts[index] = configApp;
    } else {
      walletConfig.accounts.push({
        username: account.username,
        apps: {},
      });
    }
  });

  const configAccount = walletConfig.accounts[account.index];
  configAccount.apps = configAccount.apps || {};
  configAccount.apps[app.origin] = app;
  walletConfig.accounts[account.index] = configAccount;
  await updateWalletConfig({ wallet, walletConfig: walletConfig, gaiaHubConfig });
  return walletConfig;
};
