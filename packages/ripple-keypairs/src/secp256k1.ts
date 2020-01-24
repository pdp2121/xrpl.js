import * as elliptic from 'elliptic'
import Sha512 from './sha512'

const secp256k1 = elliptic.ec('secp256k1')

function deriveScalar(bytes, discrim?: number) {
  const order = secp256k1.curve.n
  for (let i = 0; i <= 0xffffffff; i++) {
    // We hash the bytes to find a 256 bit number, looping until we are sure it
    // is less than the order of the curve.
    const hasher = new Sha512().add(bytes)
    // If the optional discriminator index was passed in, update the hash.
    if (discrim !== undefined) {
      hasher.addU32(discrim)
    }
    hasher.addU32(i)
    const key = hasher.first256BN()
    /* istanbul ignore else */
    if (key.cmpn(0) > 0 && key.cmp(order) < 0) {
      return key
    }
  }
  /* This error is practically impossible to reach.
   * The order of the curve describes the (finite) amount of points on the curve
   * https://github.com/indutny/elliptic/blob/master/lib/elliptic/curves.js#L182
   * How often will an (essentially) random number generated by Sha512 be larger than that?
   * There's 2^32 chances (the for loop) to get a number smaller than the order,
   * so it's rare that you'll even get past the first loop iteration.
   * Note that in TypeScript we actually need the throw, otherwise the function signature would be BN | undefined
   */
  /* istanbul ignore next */
  throw new Error('impossible unicorn ;)')
}

/**
 * @param {Array} seed - bytes
 * @param {Object} [opts] - object
 * @param {Number} [opts.accountIndex=0] - the account number to generate
 * @param {Boolean} [opts.validator=false] - generate root key-pair,
 *                                              as used by validators.
 * @return {bn.js} - 256 bit scalar value
 *
 */
export function derivePrivateKey(
  seed,
  opts: {
    validator?: boolean
    accountIndex?: number
  } = {},
) {
  const root = opts.validator
  const order = secp256k1.curve.n

  // This private generator represents the `root` private key, and is what's
  // used by validators for signing when a keypair is generated from a seed.
  const privateGen = deriveScalar(seed)
  if (root) {
    // As returned by validation_create for a given seed
    return privateGen
  }
  const publicGen = secp256k1.g.mul(privateGen)
  // A seed can generate many keypairs as a function of the seed and a uint32.
  // Almost everyone just uses the first account, `0`.
  const accountIndex = opts.accountIndex || 0
  return deriveScalar(publicGen.encodeCompressed(), accountIndex)
    .add(privateGen)
    .mod(order)
}

export function accountPublicFromPublicGenerator(publicGenBytes) {
  const rootPubPoint = secp256k1.curve.decodePoint(publicGenBytes)
  const scalar = deriveScalar(publicGenBytes, 0)
  const point = secp256k1.g.mul(scalar)
  const offset = rootPubPoint.add(point)
  return offset.encodeCompressed()
}
