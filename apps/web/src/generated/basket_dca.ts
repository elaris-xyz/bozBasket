/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/basket_dca.json`.
 */
export type BasketDca = {
  "address": "4Tv5nEbh6b6EGNhep7rpeLy7NXpiz8AkRmVi36iwxVuR",
  "metadata": {
    "name": "basketDca",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "bozBasket - session-aware DCA into baskets of tokenized US stocks"
  },
  "instructions": [
    {
      "name": "createPlan",
      "docs": [
        "Creates a plan and its USDC vault. Weights must sum to 10_000.",
        "`start_ts` of 0 means \"as soon as the keeper runs\"."
      ],
      "discriminator": [
        77,
        43,
        141,
        254,
        212,
        118,
        41,
        186
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "usdcMint",
          "relations": [
            "config"
          ]
        },
        {
          "name": "plan",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "planId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "plan"
              }
            ]
          }
        },
        {
          "name": "owner",
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
          "name": "planId",
          "type": "u16"
        },
        {
          "name": "amountPerPeriod",
          "type": "u64"
        },
        {
          "name": "periodSeconds",
          "type": "u64"
        },
        {
          "name": "startTs",
          "type": "i64"
        },
        {
          "name": "endTs",
          "type": "i64"
        },
        {
          "name": "legs",
          "type": {
            "vec": {
              "defined": {
                "name": "legInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "Moves USDC from the owner into the plan vault."
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "plan"
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeBasket",
      "docs": [
        "Keeper-only. Checks the guard for every leg and either fills the whole",
        "basket atomically or records a deferral with a reason code. See",
        "`execute.rs`; remaining accounts are 6 per leg in leg order."
      ],
      "discriminator": [
        41,
        166,
        15,
        16,
        73,
        118,
        95,
        138
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "plan",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "keeper",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "fillProgram",
          "address": "A6pvN8KEYn5EXcgsRbzZUqBNjA5hFqFn6Ks2Li7SPMxS",
          "relations": [
            "config"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initConfig",
      "docs": [
        "One-time global parameters. The signer becomes admin."
      ],
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "nudgePlan",
      "docs": [
        "Admin-only demo control: make a plan due at `ts` (0 = now)."
      ],
      "discriminator": [
        50,
        234,
        95,
        55,
        200,
        143,
        219,
        202
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "plan",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "ts",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setPaused",
      "docs": [
        "Owner toggles between Active and Paused. Ended plans stay ended."
      ],
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "plan",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "plan"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Admin can retune thresholds (demo controls use this too)."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "configParams"
            }
          }
        }
      ]
    },
    {
      "name": "withdraw",
      "docs": [
        "Pulls USDC out of the vault. Non-custodial: only the owner can, at any",
        "time. If less than one period remains, the plan pauses itself so the",
        "keeper does not burn a deferral on INSUFFICIENT_BALANCE."
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "plan",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "ownerUsdc",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "plan"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "plan",
      "discriminator": [
        161,
        231,
        251,
        119,
        2,
        12,
        162,
        2
      ]
    }
  ],
  "events": [
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "deferred",
      "discriminator": [
        30,
        90,
        217,
        202,
        191,
        30,
        219,
        96
      ]
    },
    {
      "name": "deposited",
      "discriminator": [
        111,
        141,
        26,
        45,
        161,
        35,
        100,
        57
      ]
    },
    {
      "name": "executed",
      "discriminator": [
        8,
        232,
        139,
        132,
        197,
        45,
        29,
        164
      ]
    },
    {
      "name": "planCreated",
      "discriminator": [
        215,
        11,
        135,
        121,
        208,
        119,
        149,
        149
      ]
    },
    {
      "name": "planEnded",
      "discriminator": [
        109,
        136,
        86,
        232,
        168,
        90,
        131,
        2
      ]
    },
    {
      "name": "statusChanged",
      "discriminator": [
        146,
        235,
        222,
        125,
        145,
        246,
        34,
        240
      ]
    },
    {
      "name": "withdrawn",
      "discriminator": [
        20,
        89,
        223,
        198,
        194,
        124,
        219,
        13
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "badLegCount",
      "msg": "A plan needs between 1 and 8 legs"
    },
    {
      "code": 6001,
      "name": "weightsDoNotSum",
      "msg": "Leg weights must sum to 10000 basis points"
    },
    {
      "code": 6002,
      "name": "zeroWeight",
      "msg": "A leg weight must be greater than zero"
    },
    {
      "code": 6003,
      "name": "duplicateMint",
      "msg": "The same mint appears twice in the basket"
    },
    {
      "code": 6004,
      "name": "zeroAmount",
      "msg": "Amount per period must be greater than zero"
    },
    {
      "code": 6005,
      "name": "periodTooShort",
      "msg": "Period is shorter than the minimum"
    },
    {
      "code": 6006,
      "name": "endBeforeStart",
      "msg": "End timestamp is before the first execution"
    },
    {
      "code": 6007,
      "name": "zeroTransfer",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6008,
      "name": "insufficientVault",
      "msg": "Vault balance is too low for this withdrawal"
    },
    {
      "code": 6009,
      "name": "planEnded",
      "msg": "Plan has ended and cannot be resumed"
    },
    {
      "code": 6010,
      "name": "noStatusChange",
      "msg": "Plan is already in that state"
    },
    {
      "code": 6011,
      "name": "notOwner",
      "msg": "Signer is not the plan owner"
    },
    {
      "code": 6012,
      "name": "notAdmin",
      "msg": "Signer is not the config admin"
    },
    {
      "code": 6013,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6014,
      "name": "notKeeper",
      "msg": "Signer is not the configured keeper"
    },
    {
      "code": 6015,
      "name": "planNotActive",
      "msg": "Plan is not active"
    },
    {
      "code": 6016,
      "name": "notDue",
      "msg": "Plan is not due yet"
    },
    {
      "code": 6017,
      "name": "wrongLegAccountCount",
      "msg": "Remaining accounts must be 6 per leg, in leg order"
    },
    {
      "code": 6018,
      "name": "badReference",
      "msg": "Reference price account is not a valid PriceUpdateV2 for this leg"
    },
    {
      "code": 6019,
      "name": "badVenue",
      "msg": "Venue account does not match this leg or the config"
    },
    {
      "code": 6020,
      "name": "mismatchedExponent",
      "msg": "Venue and reference prices use different exponents"
    }
  ],
  "types": [
    {
      "name": "config",
      "docs": [
        "Global parameters, admin-only. PDA: [\"config\"]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "The only mint plans may be funded with."
            ],
            "type": "pubkey"
          },
          {
            "name": "maxStalenessSecs",
            "docs": [
              "Max age of a reference price during session, seconds (e.g. 60)."
            ],
            "type": "u32"
          },
          {
            "name": "maxConfBps",
            "docs": [
              "Confidence / price ceiling, basis points (e.g. 50)."
            ],
            "type": "u16"
          },
          {
            "name": "maxDivergenceBps",
            "docs": [
              "|venue - reference| / reference ceiling, basis points (e.g. 150)."
            ],
            "type": "u16"
          },
          {
            "name": "minLiquidityUsdc",
            "docs": [
              "Minimum venue depth per leg, USDC base units."
            ],
            "type": "u64"
          },
          {
            "name": "fillProgram",
            "docs": [
              "Where fills happen: mock_market on devnet, Jupiter on mainnet."
            ],
            "type": "pubkey"
          },
          {
            "name": "referenceProgram",
            "docs": [
              "Who may own reference price accounts: the Pyth receiver on mainnet,",
              "mock_market on devnet. Accounts use the Pyth `PriceUpdateV2` layout."
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "configParams",
      "docs": [
        "Arguments to `init_config`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "maxStalenessSecs",
            "type": "u32"
          },
          {
            "name": "maxConfBps",
            "type": "u16"
          },
          {
            "name": "maxDivergenceBps",
            "type": "u16"
          },
          {
            "name": "minLiquidityUsdc",
            "type": "u64"
          },
          {
            "name": "fillProgram",
            "type": "pubkey"
          },
          {
            "name": "referenceProgram",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "deferred",
      "docs": [
        "The guard said no. `detail` depends on the reason: publish age in seconds",
        "for REFERENCE_STALE, basis points for CONFIDENCE_TOO_WIDE and DIVERGENCE,",
        "remaining USDC for LOW_LIQUIDITY and INSUFFICIENT_BALANCE."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "reason",
            "type": "u8"
          },
          {
            "name": "legIndex",
            "type": "u8"
          },
          {
            "name": "detail",
            "type": "i64"
          },
          {
            "name": "nextExecution",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "deposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "vaultBalance",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "executed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "usdcIn",
            "type": "u64"
          },
          {
            "name": "vaultBalance",
            "type": "u64"
          },
          {
            "name": "nextExecution",
            "type": "i64"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "legFill"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "leg",
      "docs": [
        "One stock in a basket."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "docs": [
              "Stock token mint (mock on devnet, xStocks on mainnet)."
            ],
            "type": "pubkey"
          },
          {
            "name": "weightBps",
            "docs": [
              "Share of `amount_per_period`, in basis points. Sums to 10_000 across legs."
            ],
            "type": "u16"
          },
          {
            "name": "pythFeedId",
            "docs": [
              "Pyth price feed id, identical on devnet and mainnet."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "unitsBought",
            "docs": [
              "Cumulative units received, for average cost."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "legFill",
      "docs": [
        "One leg of a completed execution."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
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
            "name": "referencePrice",
            "type": "i64"
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
      "name": "legInput",
      "docs": [
        "What the user passes to `create_plan` for each leg."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "weightBps",
            "type": "u16"
          },
          {
            "name": "pythFeedId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "plan",
      "docs": [
        "One recurring basket order. PDA: [\"plan\", owner, plan_id]."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "planId",
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "amountPerPeriod",
            "docs": [
              "USDC base units (6 decimals) spent per period."
            ],
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "docs": [
              "604_800 for weekly; the demo also allows daily."
            ],
            "type": "u64"
          },
          {
            "name": "nextExecution",
            "docs": [
              "Unix timestamp of the next allowed execution."
            ],
            "type": "i64"
          },
          {
            "name": "endTs",
            "docs": [
              "0 = open-ended."
            ],
            "type": "i64"
          },
          {
            "name": "legs",
            "docs": [
              "Fixed array; entries past `leg_count` are zeroed."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "leg"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "legCount",
            "type": "u8"
          },
          {
            "name": "executions",
            "type": "u32"
          },
          {
            "name": "deferrals",
            "type": "u32"
          },
          {
            "name": "lastReason",
            "docs": [
              "`ReasonCode` of the last attempt."
            ],
            "type": "u8"
          },
          {
            "name": "totalInvested",
            "type": "u64"
          },
          {
            "name": "status",
            "docs": [
              "`PlanStatus`."
            ],
            "type": "u8"
          },
          {
            "name": "vault",
            "docs": [
              "USDC vault token account, authority = this plan PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "planCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "planId",
            "type": "u16"
          },
          {
            "name": "amountPerPeriod",
            "type": "u64"
          },
          {
            "name": "periodSeconds",
            "type": "u64"
          },
          {
            "name": "nextExecution",
            "type": "i64"
          },
          {
            "name": "legCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "planEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "ts",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "statusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "withdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plan",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "vaultBalance",
            "type": "u64"
          },
          {
            "name": "paused",
            "docs": [
              "True when the withdrawal left less than one period and paused the plan."
            ],
            "type": "bool"
          }
        ]
      }
    }
  ]
};
