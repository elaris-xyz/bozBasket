/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mock_market.json`.
 */
export type MockMarket = {
  "address": "A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS",
  "metadata": {
    "name": "mockMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "bozBasket devnet fill venue and reference-price relay. Synthetic; not for mainnet."
  },
  "instructions": [
    {
      "name": "fill",
      "docs": [
        "Takes `usdc_in` from `payer_usdc` and mints stock units to `recipient`",
        "at the venue price. The venue price is the override if set, else the",
        "reference, plus `spread_bps`. Returns the units minted."
      ],
      "discriminator": [
        168,
        96,
        183,
        163,
        92,
        10,
        40,
        160
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "stockMint",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "reference",
          "relations": [
            "market"
          ]
        },
        {
          "name": "payerUsdc",
          "docs": [
            "USDC leaves here. Its authority signs (a user, or the plan PDA via CPI)."
          ],
          "writable": true
        },
        {
          "name": "payerAuthority",
          "signer": true
        },
        {
          "name": "recipient",
          "docs": [
            "Stock units land here. Any token account of `stock_mint`."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "usdcIn",
          "type": "u64"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "initMarket",
      "docs": [
        "Creates a market and its stock mint. `symbol` is the ticker without",
        "suffix, at most 8 bytes; it seeds every PDA of this market. Call",
        "`init_market_accounts` next; the two steps exist because four `init`",
        "accounts in one instruction overflow the 4 KiB SBF stack frame."
      ],
      "discriminator": [
        33,
        253,
        15,
        116,
        89,
        25,
        127,
        236
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "symbol"
              }
            ]
          }
        },
        {
          "name": "stockMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  111,
                  99,
                  107
                ]
              },
              {
                "kind": "arg",
                "path": "symbol"
              }
            ]
          }
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "feedId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "spreadBps",
          "type": "u16"
        },
        {
          "name": "liquidityUsdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initMarketAccounts",
      "docs": [
        "Second half of market creation: the USDC treasury and the reference",
        "price account (Pyth `PriceUpdateV2` layout, zero price until posted)."
      ],
      "discriminator": [
        209,
        112,
        60,
        87,
        90,
        98,
        145,
        41
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "usdcMint",
          "relations": [
            "market"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "market.symbol",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "reference",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  102,
                  101,
                  114,
                  101,
                  110,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "market.symbol",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "postReference",
      "docs": [
        "Writes a reference price with the Pyth `PriceUpdateV2` layout.",
        "`publish_time` must be the source's own timestamp, not \"now\", or the",
        "staleness guard is meaningless."
      ],
      "discriminator": [
        82,
        167,
        210,
        44,
        66,
        228,
        195,
        118
      ],
      "accounts": [
        {
          "name": "market"
        },
        {
          "name": "reference",
          "writable": true,
          "relations": [
            "market"
          ]
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "i64"
        },
        {
          "name": "conf",
          "type": "u64"
        },
        {
          "name": "exponent",
          "type": "i32"
        },
        {
          "name": "publishTime",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setLiquidity",
      "docs": [
        "Demo control: venue depth. Fills drain it; this resets it."
      ],
      "discriminator": [
        114,
        136,
        102,
        94,
        199,
        126,
        61,
        228
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "liquidityUsdc",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPriceOverride",
      "docs": [
        "Demo control: venue price that ignores the reference. 0 clears it.",
        "Same exponent as the reference account."
      ],
      "discriminator": [
        79,
        49,
        167,
        8,
        176,
        138,
        254,
        222
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "price",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setSpread",
      "discriminator": [
        194,
        179,
        203,
        7,
        196,
        128,
        242,
        85
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "spreadBps",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "priceUpdateV2",
      "discriminator": [
        34,
        241,
        35,
        99,
        157,
        126,
        244,
        205
      ]
    }
  ],
  "events": [
    {
      "name": "filled",
      "discriminator": [
        134,
        4,
        17,
        63,
        221,
        45,
        177,
        173
      ]
    },
    {
      "name": "referencePosted",
      "discriminator": [
        231,
        2,
        233,
        145,
        36,
        225,
        209,
        20
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badSymbol",
      "msg": "Symbol must be 1 to 8 bytes"
    },
    {
      "code": 6001,
      "name": "badSpread",
      "msg": "Spread must be below 10000 basis points"
    },
    {
      "code": 6002,
      "name": "badPrice",
      "msg": "Price must be positive"
    },
    {
      "code": 6003,
      "name": "badExponent",
      "msg": "Exponent must be between -12 and 0"
    },
    {
      "code": 6004,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6005,
      "name": "lowLiquidity",
      "msg": "Venue liquidity is below the requested amount"
    },
    {
      "code": 6006,
      "name": "dustFill",
      "msg": "Amount is too small to buy one unit"
    },
    {
      "code": 6007,
      "name": "notAdmin",
      "msg": "Signer is not the market admin"
    },
    {
      "code": 6008,
      "name": "alreadyInitialized",
      "msg": "Market accounts already initialized"
    },
    {
      "code": 6009,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "filled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "usdcIn",
            "type": "u64"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "venuePrice",
            "type": "i64"
          },
          {
            "name": "exponent",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "One mock stock. PDA: [\"market\", symbol]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "stockMint",
            "docs": [
              "PDA [\"stock\", symbol]; mint authority is this market."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "USDC paid by fills. PDA [\"treasury\", symbol]."
            ],
            "type": "pubkey"
          },
          {
            "name": "reference",
            "docs": [
              "`PriceUpdateV2`-layout account. PDA [\"reference\", symbol]."
            ],
            "type": "pubkey"
          },
          {
            "name": "feedId",
            "docs": [
              "Pyth feed id this market mirrors (informational)."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "spreadBps",
            "docs": [
              "Added on top of the reference when filling."
            ],
            "type": "u16"
          },
          {
            "name": "liquidityUsdc",
            "docs": [
              "Remaining depth in USDC base units. Fills subtract from it."
            ],
            "type": "u64"
          },
          {
            "name": "priceOverride",
            "docs": [
              "If non-zero, the venue quotes this instead of the reference. Demo",
              "control for the DIVERGENCE scenario. Same exponent as the reference."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "stockMintBump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "referenceBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "priceFeedMessage",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "type": "i64"
          },
          {
            "name": "prevPublishTime",
            "type": "i64"
          },
          {
            "name": "emaPrice",
            "type": "i64"
          },
          {
            "name": "emaConf",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceUpdateV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "writeAuthority",
            "type": "pubkey"
          },
          {
            "name": "verificationLevel",
            "type": {
              "defined": {
                "name": "verificationLevel"
              }
            }
          },
          {
            "name": "priceMessage",
            "type": {
              "defined": {
                "name": "priceFeedMessage"
              }
            }
          },
          {
            "name": "postedSlot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "referencePosted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "exponent",
            "type": "i32"
          },
          {
            "name": "publishTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "verificationLevel",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "partial",
            "fields": [
              {
                "name": "numSignatures",
                "type": "u8"
              }
            ]
          },
          {
            "name": "full"
          }
        ]
      }
    }
  ]
};
