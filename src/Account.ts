import { AccountInfo, Commitment, PublicKey, Connection } from '@solana/web3.js';
import { AnyPublicKey } from '@metaplex/types';
import { Buffer } from 'buffer';

export type AccountConstructor<T> = {
  new (pubkey: AnyPublicKey, info: AccountInfo<Buffer>): T;
};

export class Account<T = unknown> {
  readonly pubkey: PublicKey;
  readonly info: AccountInfo<Buffer>;
  data: T;

  constructor(pubkey: AnyPublicKey, info?: AccountInfo<Buffer>) {
    this.pubkey = new PublicKey(pubkey);
    this.info = info;
  }

  static from<T>(this: AccountConstructor<T>, account: Account<unknown>) {
    return new this(account.pubkey, account.info);
  }

  static async load<T>(
    this: AccountConstructor<T>,
    connection: Connection,
    pubkey: AnyPublicKey,
  ): Promise<T> {
    const info = await Account.getInfo(connection, pubkey);

    return new this(pubkey, info);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static isCompatible(data: Buffer): boolean {
    throw new Error(`method 'isCompatible' is not implemented`);
  }

  static async getInfo(connection: Connection, pubkey: AnyPublicKey) {
    const info = await connection.getAccountInfo(new PublicKey(pubkey));
    if (!info) {
      throw new Error(`Unable to find account: ${pubkey}`);
    }

    return { ...info, data: Buffer.from(info?.data) };
  }

  static async getInfos(
    connection: Connection,
    pubkeys: AnyPublicKey[],
    commitment: Commitment = 'recent',
  ) {
    const BATCH_SIZE = 99; // Must batch above this limit.

    const promises: Promise<Map<AnyPublicKey, AccountInfo<Buffer>> | undefined>[] = [];
    for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
      promises.push(
        Account.getMultipleAccounts(
          connection,
          pubkeys.slice(i, Math.min(pubkeys.length, i + BATCH_SIZE)),
          commitment,
        ),
      );
    }

    const results = new Map<AnyPublicKey, AccountInfo<Buffer>>();
    (await Promise.all(promises)).forEach((result) =>
      [...(result?.entries() ?? [])].forEach(([k, v]) => results.set(k, v)),
    );
    return results;
  }

  private static async getMultipleAccounts(
    connection: Connection,
    pubkeys: AnyPublicKey[],
    commitment: Commitment,
  ) {
    const args = connection._buildArgs([pubkeys.map((k) => k.toString())], commitment, 'base64');
    const unsafeRes = await (connection as any)._rpcRequest('getMultipleAccounts', args);
    if (unsafeRes.error) {
      throw new Error('failed to get info about accounts ' + unsafeRes.error.message);
    }
    if (!unsafeRes.result.value) return;
    const infos = (unsafeRes.result.value as AccountInfo<string[]>[])
      .filter(Boolean)
      .map((info) => ({
        ...info,
        data: Buffer.from(info.data[0], 'base64'),
      })) as AccountInfo<Buffer>[];
    return infos.reduce((acc, info, index) => {
      acc.set(pubkeys[index], info);
      return acc;
    }, new Map<AnyPublicKey, AccountInfo<Buffer>>());
  }

  assertOwner(pubkey: AnyPublicKey) {
    return this.info?.owner.equals(new PublicKey(pubkey));
  }

  toJSON() {
    return {
      pubkey: this.pubkey.toString(),
      info: {
        executable: !!this.info?.executable,
        owner: this.info?.owner ? new PublicKey(this.info?.owner) : null,
        lamports: this.info?.lamports,
        data: this.info?.data.toJSON(),
      },
      data: this.data,
    };
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }
}
