/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rps.json`.
 */
export type Rps = {
  "address": "Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA",
  "metadata": {
    "name": "rps",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Commit-reveal Rock-Paper-Scissors with SOL wagers"
  },
  "instructions": [
    {
      "name": "cancelGame",
      "discriminator": [
        121,
        194,
        154,
        118,
        103,
        235,
        149,
        52
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "game",
          "docs": [
            "Closing the account returns the stake and the rent together."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.creator",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.gameId",
                "account": "game"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "claimForfeit",
      "discriminator": [
        42,
        69,
        137,
        86,
        190,
        158,
        173,
        17
      ],
      "accounts": [
        {
          "name": "opponent",
          "writable": true,
          "signer": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.creator",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.gameId",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "game"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "createGame",
      "discriminator": [
        124,
        69,
        75,
        66,
        184,
        220,
        72,
        206
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
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
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "u64"
        },
        {
          "name": "stake",
          "type": "u64"
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
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
          "name": "program",
          "address": "Fmi151zsEHFgRJeUXNgDjbo4aLA6PRQ63ktWM6sCEgkA"
        },
        {
          "name": "programData",
          "docs": [
            "Only the program's upgrade authority may create the config, so nobody",
            "can front-run initialization after a deploy."
          ]
        },
        {
          "name": "treasury",
          "docs": [
            "The fee wallet. It must be a system-owned account that can be",
            "write-locked: `reveal` credits it, so an address that can never be",
            "writable (a sysvar, a program id) would make every reveal fail."
          ],
          "writable": true
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
      "name": "joinGame",
      "discriminator": [
        107,
        112,
        18,
        38,
        56,
        173,
        60,
        128
      ],
      "accounts": [
        {
          "name": "opponent",
          "writable": true,
          "signer": true
        },
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
          "name": "game",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.creator",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.gameId",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "mv",
          "type": "u8"
        },
        {
          "name": "expectedStake",
          "type": "u64"
        },
        {
          "name": "expectedCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "reveal",
      "discriminator": [
        9,
        35,
        59,
        190,
        167,
        249,
        76,
        115
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "game",
          "docs": [
            "Payouts leave this account first; whatever remains is the rent, which",
            "`close` returns to the creator."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "game.creator",
                "account": "game"
              },
              {
                "kind": "account",
                "path": "game.gameId",
                "account": "game"
              }
            ]
          }
        },
        {
          "name": "opponent",
          "writable": true,
          "relations": [
            "game"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "game"
          ]
        }
      ],
      "args": [
        {
          "name": "mv",
          "type": "u8"
        },
        {
          "name": "salt",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "setPaused",
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
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
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
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
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
          "name": "newTreasury",
          "docs": [
            "Pass this to change the fee wallet. It must be a system-owned account",
            "that can be write-locked, for the same reason as in `initialize_config`."
          ],
          "writable": true,
          "optional": true
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateConfigParams"
            }
          }
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
      "name": "game",
      "discriminator": [
        27,
        90,
        166,
        125,
        74,
        100,
        121,
        18
      ]
    }
  ],
  "events": [
    {
      "name": "gameCancelled",
      "discriminator": [
        113,
        20,
        200,
        104,
        76,
        35,
        9,
        241
      ]
    },
    {
      "name": "gameCreated",
      "discriminator": [
        218,
        25,
        150,
        94,
        177,
        112,
        96,
        2
      ]
    },
    {
      "name": "gameForfeited",
      "discriminator": [
        125,
        11,
        196,
        100,
        157,
        9,
        28,
        65
      ]
    },
    {
      "name": "gameJoined",
      "discriminator": [
        111,
        242,
        51,
        235,
        66,
        43,
        140,
        84
      ]
    },
    {
      "name": "gameSettled",
      "discriminator": [
        63,
        109,
        128,
        85,
        229,
        63,
        167,
        176
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "paused",
      "msg": "New games and joins are paused"
    },
    {
      "code": 6001,
      "name": "invalidMove",
      "msg": "Move must be 0 (rock), 1 (paper) or 2 (scissors)"
    },
    {
      "code": 6002,
      "name": "stakeTooLow",
      "msg": "Stake is below the minimum"
    },
    {
      "code": 6003,
      "name": "stakeMismatch",
      "msg": "Stake does not match the game's stake"
    },
    {
      "code": 6004,
      "name": "invalidGameState",
      "msg": "The game is not in the right state for this action"
    },
    {
      "code": 6005,
      "name": "commitmentMismatch",
      "msg": "Move and salt do not match the commitment"
    },
    {
      "code": 6006,
      "name": "cannotJoinOwnGame",
      "msg": "You cannot join your own game"
    },
    {
      "code": 6007,
      "name": "revealTimeoutNotReached",
      "msg": "The reveal timeout has not passed yet"
    },
    {
      "code": 6008,
      "name": "unauthorized",
      "msg": "You are not allowed to do this"
    },
    {
      "code": 6009,
      "name": "invalidTreasury",
      "msg": "Treasury account is invalid"
    },
    {
      "code": 6010,
      "name": "treasuryCannotPlay",
      "msg": "The treasury wallet cannot play"
    },
    {
      "code": 6011,
      "name": "feeTooHigh",
      "msg": "Fee is above the maximum of 1000 bps"
    },
    {
      "code": 6012,
      "name": "invalidTimeout",
      "msg": "Reveal timeout must be between 60 and 86400 seconds"
    },
    {
      "code": 6013,
      "name": "minStakeTooLow",
      "msg": "Minimum stake is below the allowed floor"
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6015,
      "name": "gameChanged",
      "msg": "The game changed since you loaded it. Refresh and try again"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "revealTimeout",
            "type": "i64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "configParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "revealTimeout",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "game",
      "docs": [
        "Field order is part of the public interface: the frontend filters on",
        "`status` at byte 8, `creator` at byte 9 and `opponent` at byte 41."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "gameStatus"
              }
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "opponentMove",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "joinedAt",
            "type": "i64"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "revealTimeout",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gameCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameForfeited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "opponentMove",
            "type": "u8"
          },
          {
            "name": "revealDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "gameSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "opponent",
            "type": "pubkey"
          },
          {
            "name": "creatorMove",
            "type": "u8"
          },
          {
            "name": "opponentMove",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": {
              "defined": {
                "name": "outcome"
              }
            }
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "creatorPayout",
            "type": "u64"
          },
          {
            "name": "opponentPayout",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "gameStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "joined"
          }
        ]
      }
    },
    {
      "name": "outcome",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "creatorWins"
          },
          {
            "name": "opponentWins"
          },
          {
            "name": "tie"
          }
        ]
      }
    },
    {
      "name": "updateConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "feeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "minStake",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "revealTimeout",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    }
  ]
};
