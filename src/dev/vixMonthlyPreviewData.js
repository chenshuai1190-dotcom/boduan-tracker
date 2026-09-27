// DEV-only generated historical fixture. Do not import into production.
// Source: existing official-close snapshot and full-history V2 replay.
// Regenerate: node artifacts/vix-monthly-design/build-preview-fixture.mjs
// Current captured adjusted history; not signals emitted live in 2025/2026.

export const VIX_MONTHLY_PREVIEW_META = {
  "source": "CBOE_EODHD_EOD",
  "capturedAt": "2026-09-27T05:39:05.796Z",
  "modelVersion": "v2",
  "localPreview": true
};

export const VIX_MONTHLY_PREVIEW_REPORTS = [
  {
    "month": "2025-01",
    "monthLabel": "2025年1月",
    "status": "complete",
    "asOfDate": "2025-01-31",
    "expectedSessions": 20,
    "observedSessions": 20,
    "priorSession": {
      "date": "2024-12-31",
      "VIX": 17.35,
      "VIX3M": 18.98,
      "ratio": 0.9141201264488936,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 2.6856390469108815,
        "baselineClose": 574.7794,
        "baselineDate": "2024-12-31"
      },
      "QQQ": {
        "monthlyChangePct": 2.163391735526754,
        "baselineClose": 506.9216,
        "baselineDate": "2024-12-31"
      },
      "vixMax": {
        "value": 19.54,
        "date": "2025-01-10"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-01-02",
        "VIX": 17.93,
        "VIX3M": 19.33,
        "ratio": 0.9275737196068289,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 573.3672,
            "dailyChangePct": -0.2456942611373969,
            "cumulativeChangePct": -0.2456942611373969,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2024-12-19"
          },
          "QQQ": {
            "adjustedClose": 505.93,
            "dailyChangePct": -0.1956121025420865,
            "cumulativeChangePct": -0.1956121025420865,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-01-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-03",
        "VIX": 16.13,
        "VIX3M": 18.14,
        "ratio": 0.8891951488423373,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 580.5362,
            "dailyChangePct": 1.2503331198575607,
            "cumulativeChangePct": 1.00156686199957,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2024-12-19"
          },
          "QQQ": {
            "adjustedClose": 514.2096,
            "dailyChangePct": 1.636510979779815,
            "cumulativeChangePct": 1.4376976637018535,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-01-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-06",
        "VIX": 16.04,
        "VIX3M": 18.03,
        "ratio": 0.8896283971159178,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 583.8805,
            "dailyChangePct": 0.576070880678925,
            "cumulativeChangePct": 1.5834074777210105,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2024-12-19"
          },
          "QQQ": {
            "adjustedClose": 520.1194,
            "dailyChangePct": 1.1492978738631088,
            "cumulativeChangePct": 2.6035189662464653,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-01-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-07",
        "VIX": 17.82,
        "VIX3M": 19.19,
        "ratio": 0.9286086503387181,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 577.2802,
            "dailyChangePct": -1.1304196663529553,
            "cumulativeChangePct": 0.4350886618414096,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2024-12-19"
          },
          "QQQ": {
            "adjustedClose": 510.8383,
            "dailyChangePct": -1.7844171934367492,
            "cumulativeChangePct": 0.7726441327416289,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-01-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-08",
        "VIX": 17.7,
        "VIX3M": 19.34,
        "ratio": 0.9152016546018614,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 578.1236,
            "dailyChangePct": 0.1460988961686116,
            "cumulativeChangePct": 0.5818232177423166,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2024-12-19"
          },
          "QQQ": {
            "adjustedClose": 510.9275,
            "dailyChangePct": 0.01746149417536369,
            "cumulativeChangePct": 0.7902405421272185,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-01-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-10",
        "VIX": 19.54,
        "VIX3M": 20.97,
        "ratio": 0.9318073438245112,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 569.2972,
            "dailyChangePct": -1.526732345816717,
            "cumulativeChangePct": -0.9537920113351417,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 502.9156,
            "dailyChangePct": -1.568108978279703,
            "cumulativeChangePct": -0.7902602690435856,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-01-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-13",
        "VIX": 19.19,
        "VIX3M": 20.43,
        "ratio": 0.9393049437102301,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 570.1798,
            "dailyChangePct": 0.15503325855108496,
            "cumulativeChangePct": -0.8002374476190344,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 501.2993,
            "dailyChangePct": -0.32138593433966856,
            "cumulativeChangePct": -1.1091064180338672,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-01-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-14",
        "VIX": 18.71,
        "VIX3M": 19.99,
        "ratio": 0.9359679839919961,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 570.9644,
            "dailyChangePct": 0.1376057166528888,
            "cumulativeChangePct": -0.6637329034408723,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 500.8234,
            "dailyChangePct": -0.09493330631022978,
            "cumulativeChangePct": -1.2029868129509569,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-15",
        "VIX": 16.12,
        "VIX3M": 18.23,
        "ratio": 0.884256719692814,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 581.3502,
            "dailyChangePct": 1.8189925676627139,
            "cumulativeChangePct": 1.143186412039121,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 512.3455,
            "dailyChangePct": 2.3006313203416617,
            "cumulativeChangePct": 1.0699682159923674,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-16",
        "VIX": 16.6,
        "VIX3M": 18.35,
        "ratio": 0.9046321525885559,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 580.2322,
            "dailyChangePct": -0.19231093409788347,
            "cumulativeChangePct": 0.9486770054737637,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 508.756,
            "dailyChangePct": -0.7006014496077406,
            "cumulativeChangePct": 0.3618705535530564,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-17",
        "VIX": 15.97,
        "VIX3M": 18.19,
        "ratio": 0.8779549202858713,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 586.0576,
            "dailyChangePct": 1.0039773731964408,
            "cumulativeChangePct": 1.9621788811498675,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 517.343,
            "dailyChangePct": 1.687842502103165,
            "cumulativeChangePct": 2.0558208606616724,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-21",
        "VIX": 15.06,
        "VIX3M": 17.5,
        "ratio": 0.8605714285714287,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 591.4222,
            "dailyChangePct": 0.9153707758418284,
            "cumulativeChangePct": 2.895510869039497,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 520.3772,
            "dailyChangePct": 0.5864967729340309,
            "cumulativeChangePct": 2.6543749566007913,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-22",
        "VIX": 15.1,
        "VIX3M": 17.81,
        "ratio": 0.8478382930937676,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 594.7468,
            "dailyChangePct": 0.5621364906491566,
            "cumulativeChangePct": 3.4739240828742357,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 527.0306,
            "dailyChangePct": 1.2785725431475603,
            "cumulativeChangePct": 3.9668856091356286,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-23",
        "VIX": 15.02,
        "VIX3M": 17.52,
        "ratio": 0.8573059360730594,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 597.993,
            "dailyChangePct": 0.5458121002080318,
            "cumulativeChangePct": 4.038697281078618,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 528.1511,
            "dailyChangePct": 0.21260625094634555,
            "cumulativeChangePct": 4.187925706854867,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-24",
        "VIX": 14.85,
        "VIX3M": 17.55,
        "ratio": 0.8461538461538461,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 596.2473,
            "dailyChangePct": -0.29192649412285165,
            "cumulativeChangePct": 3.7349807595748796,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 525.1665,
            "dailyChangePct": -0.5651034334681837,
            "cumulativeChangePct": 3.5991561614261425,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-27",
        "VIX": 17.9,
        "VIX3M": 18.97,
        "ratio": 0.9435951502372166,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 587.8131,
            "dailyChangePct": -1.4145472860002894,
            "cumulativeChangePct": 2.267600404607384,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 509.8764,
            "dailyChangePct": -2.911476645977995,
            "cumulativeChangePct": 0.5828909243559499,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-28",
        "VIX": 16.41,
        "VIX3M": 18.13,
        "ratio": 0.9051296194153338,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 592.8638,
            "dailyChangePct": 0.8592356992384254,
            "cumulativeChangePct": 3.146320136038261,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 517.4124,
            "dailyChangePct": 1.4780052577448188,
            "cumulativeChangePct": 2.0695113406096866,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-29",
        "VIX": 16.56,
        "VIX3M": 18.15,
        "ratio": 0.912396694214876,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 590.2061,
            "dailyChangePct": -0.4482817132703931,
            "cumulativeChangePct": 2.6839340449570814,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 516.4407,
            "dailyChangePct": -0.18779990583914774,
            "cumulativeChangePct": 1.8778248944215425,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-30",
        "VIX": 15.84,
        "VIX3M": 17.91,
        "ratio": 0.8844221105527638,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 593.3738,
            "dailyChangePct": 0.5367108201694171,
            "cumulativeChangePct": 3.2350498295519836,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 518.6419,
            "dailyChangePct": 0.4262251212965973,
            "cumulativeChangePct": 2.312053777152112,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-01-31",
        "VIX": 16.43,
        "VIX3M": 18.43,
        "ratio": 0.8914812805208898,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 590.2159,
            "dailyChangePct": -0.5321940402491565,
            "cumulativeChangePct": 2.6856390469108815,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 517.8883,
            "dailyChangePct": -0.1453025681110609,
            "cumulativeChangePct": 2.163391735526754,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-02",
    "monthLabel": "2025年2月",
    "status": "complete",
    "asOfDate": "2025-02-28",
    "expectedSessions": 19,
    "observedSessions": 19,
    "priorSession": {
      "date": "2025-01-31",
      "VIX": 16.43,
      "VIX3M": 18.43,
      "ratio": 0.8914812805208898,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -1.2694846072428767,
        "baselineClose": 590.2159,
        "baselineDate": "2025-01-31"
      },
      "QQQ": {
        "monthlyChangePct": -2.7034787231146162,
        "baselineClose": 517.8883,
        "baselineDate": "2025-01-31"
      },
      "vixMax": {
        "value": 21.13,
        "date": "2025-02-27"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-02-03",
        "VIX": 18.62,
        "VIX3M": 19.55,
        "ratio": 0.9524296675191816,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 586.244,
            "dailyChangePct": -0.6729571331439921,
            "cumulativeChangePct": -0.6729571331439921,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 513.7436,
            "dailyChangePct": -0.8003077111415569,
            "cumulativeChangePct": -0.8003077111415569,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-04",
        "VIX": 17.21,
        "VIX3M": 18.64,
        "ratio": 0.9232832618025751,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 590.1767,
            "dailyChangePct": 0.670829893354985,
            "cumulativeChangePct": -0.0066416374076117,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 520.05,
            "dailyChangePct": 1.2275384063178407,
            "cumulativeChangePct": 0.41740661065330364,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-05",
        "VIX": 15.77,
        "VIX3M": 17.96,
        "ratio": 0.8780623608017817,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 592.5696,
            "dailyChangePct": 0.4054548408976677,
            "cumulativeChangePct": 0.3987862746496651,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 522.4099,
            "dailyChangePct": 0.4537832900682659,
            "cumulativeChangePct": 0.8730840221723657,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-06",
        "VIX": 15.5,
        "VIX3M": 17.94,
        "ratio": 0.8639910813823857,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 594.6291,
            "dailyChangePct": 0.34755411009945725,
            "cumulativeChangePct": 0.7477263828371994,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 525.1367,
            "dailyChangePct": 0.5219656059351152,
            "cumulativeChangePct": 1.3996068264141348,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-07",
        "VIX": 16.54,
        "VIX3M": 18.63,
        "ratio": 0.8878153515834676,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 589.1861,
            "dailyChangePct": -0.9153605163285783,
            "cumulativeChangePct": -0.17447852557005428,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-10"
          },
          "QQQ": {
            "adjustedClose": 518.513,
            "dailyChangePct": -1.2613287168845688,
            "cumulativeChangePct": 0.12062446670451088,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-10",
        "VIX": 15.81,
        "VIX3M": 18.23,
        "ratio": 0.8672517827756445,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 593.1875,
            "dailyChangePct": 0.6791402580610839,
            "cumulativeChangePct": 0.5034767785822014,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-13"
          },
          "QQQ": {
            "adjustedClose": 524.7897,
            "dailyChangePct": 1.2105193119555269,
            "cumulativeChangePct": 1.3326039611244456,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-11",
        "VIX": 16.02,
        "VIX3M": 18.28,
        "ratio": 0.8763676148796498,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 593.6386,
            "dailyChangePct": 0.07604678116110986,
            "cumulativeChangePct": 0.5799064376273089,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-14"
          },
          "QQQ": {
            "adjustedClose": 523.5403,
            "dailyChangePct": -0.23807631895215176,
            "cumulativeChangePct": 1.091355027715446,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-12",
        "VIX": 15.89,
        "VIX3M": 18.31,
        "ratio": 0.8678317859093393,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 591.7262,
            "dailyChangePct": -0.3221488629614133,
            "cumulativeChangePct": 0.2558894126708511,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-01-16"
          },
          "QQQ": {
            "adjustedClose": 523.8477,
            "dailyChangePct": 0.05871563277937142,
            "cumulativeChangePct": 1.1507114565052046,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-01-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-13",
        "VIX": 15.1,
        "VIX3M": 17.84,
        "ratio": 0.8464125560538116,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 597.9734,
            "dailyChangePct": 1.0557585586036256,
            "cumulativeChangePct": 1.314349545649307,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-16"
          },
          "QQQ": {
            "adjustedClose": 531.3836,
            "dailyChangePct": 1.4385669728052664,
            "cumulativeChangePct": 2.6058321842760357,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-01-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-14",
        "VIX": 14.77,
        "VIX3M": 17.81,
        "ratio": 0.8293093767546322,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 597.944,
            "dailyChangePct": -0.004916606658422751,
            "cumulativeChangePct": 1.3093683175936066,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-01-17"
          },
          "QQQ": {
            "adjustedClose": 533.6147,
            "dailyChangePct": 0.41986617577207674,
            "cumulativeChangePct": 3.0366393679872594,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-18",
        "VIX": 15.35,
        "VIX3M": 17.82,
        "ratio": 0.8613916947250281,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 599.6994,
            "dailyChangePct": 0.29357264225413626,
            "cumulativeChangePct": 1.6067849070145135,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-02-03"
          },
          "QQQ": {
            "adjustedClose": 534.8244,
            "dailyChangePct": 0.2266991520285977,
            "cumulativeChangePct": 3.270222555713276,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-19",
        "VIX": 15.27,
        "VIX3M": 17.93,
        "ratio": 0.8516452872281093,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 601.1117,
            "dailyChangePct": 0.23550131949441333,
            "cumulativeChangePct": 1.8460702261663853,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-02-03"
          },
          "QQQ": {
            "adjustedClose": 534.9731,
            "dailyChangePct": 0.027803518313684883,
            "cumulativeChangePct": 3.298935310954132,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-20",
        "VIX": 15.66,
        "VIX3M": 18.01,
        "ratio": 0.869516935036091,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 598.6108,
            "dailyChangePct": -0.41604580313442385,
            "cumulativeChangePct": 1.4223439253330916,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-02-03"
          },
          "QQQ": {
            "adjustedClose": 532.7024,
            "dailyChangePct": -0.424451248109492,
            "cumulativeChangePct": 2.8604816907429775,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-21",
        "VIX": 18.21,
        "VIX3M": 19.48,
        "ratio": 0.9348049281314169,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 588.3721,
            "dailyChangePct": -1.7104101696795326,
            "cumulativeChangePct": -0.31239415949315674,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-02-03"
          },
          "QQQ": {
            "adjustedClose": 521.6464,
            "dailyChangePct": -2.0754552635768198,
            "cumulativeChangePct": 0.7256584093519702,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-24",
        "VIX": 18.98,
        "VIX3M": 19.86,
        "ratio": 0.9556898288016114,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 585.6948,
            "dailyChangePct": -0.45503517246995306,
            "cumulativeChangePct": -0.7660078286606753,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-02-24"
          },
          "QQQ": {
            "adjustedClose": 515.4887,
            "dailyChangePct": -1.180435636093713,
            "cumulativeChangePct": -0.4633431572020341,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-01-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-25",
        "VIX": 19.43,
        "VIX3M": 20.03,
        "ratio": 0.9700449326010983,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 582.782,
            "dailyChangePct": -0.49732386218896973,
            "cumulativeChangePct": -1.2595221511314758,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-02-25"
          },
          "QQQ": {
            "adjustedClose": 508.9939,
            "dailyChangePct": -1.2599306250554054,
            "cumulativeChangePct": -1.7174359799207561,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-02-25"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-26",
        "VIX": 19.1,
        "VIX3M": 19.75,
        "ratio": 0.9670886075949368,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 583.0763,
            "dailyChangePct": 0.050499157489403146,
            "cumulativeChangePct": -1.2096590417167818,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-02-25"
          },
          "QQQ": {
            "adjustedClose": 510.2235,
            "dailyChangePct": 0.24157460433218425,
            "cumulativeChangePct": -1.480010264761722,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-02-25"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-27",
        "VIX": 21.13,
        "VIX3M": 21.22,
        "ratio": 0.9957587181903864,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 573.7692,
            "dailyChangePct": -1.596206191196592,
            "cumulativeChangePct": -2.786556580397115,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-02-27"
          },
          "QQQ": {
            "adjustedClose": 496.0539,
            "dailyChangePct": -2.7771359022075615,
            "cumulativeChangePct": -4.216044270550223,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-02-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-02-28",
        "VIX": 19.63,
        "VIX3M": 20.18,
        "ratio": 0.9727452923686818,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 582.7232,
            "dailyChangePct": 1.560557799198703,
            "cumulativeChangePct": -1.2694846072428767,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-02-27"
          },
          "QQQ": {
            "adjustedClose": 503.8873,
            "dailyChangePct": 1.5791429116876143,
            "cumulativeChangePct": -2.7034787231146162,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-02-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-03",
    "monthLabel": "2025年3月",
    "status": "complete",
    "asOfDate": "2025-03-31",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2025-02-28",
      "VIX": 19.63,
      "VIX3M": 20.18,
      "ratio": 0.9727452923686818,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -5.571993701297629,
        "baselineClose": 582.7232,
        "baselineDate": "2025-02-28"
      },
      "QQQ": {
        "monthlyChangePct": -7.586240018353307,
        "baselineClose": 503.8873,
        "baselineDate": "2025-02-28"
      },
      "vixMax": {
        "value": 27.86,
        "date": "2025-03-10"
      },
      "highStressDays": 2,
      "inversionDays": 10
    },
    "rows": [
      {
        "date": "2025-03-03",
        "VIX": 22.78,
        "VIX3M": 22.18,
        "ratio": 1.0270513976555455,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 572.5139,
            "dailyChangePct": -1.7519982042932147,
            "cumulativeChangePct": -1.7519982042932147,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-03"
          },
          "QQQ": {
            "adjustedClose": 492.8611,
            "dailyChangePct": -2.188227407199972,
            "cumulativeChangePct": -2.188227407199972,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-03"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-03",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-04",
        "VIX": 23.51,
        "VIX3M": 22.78,
        "ratio": 1.0320456540825285,
        "currentRiskDuration": 2,
        "inversionDays": 2,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 565.7372,
            "dailyChangePct": -1.1836743177763953,
            "cumulativeChangePct": -2.914934569277483,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-04"
          },
          "QQQ": {
            "adjustedClose": 491.3737,
            "dailyChangePct": -0.3017888812892777,
            "cumulativeChangePct": -2.483412461476997,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-04"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-03",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-05",
        "VIX": 21.93,
        "VIX3M": 21.72,
        "ratio": 1.009668508287293,
        "currentRiskDuration": 3,
        "inversionDays": 3,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 571.8176,
            "dailyChangePct": 1.0747746480167741,
            "cumulativeChangePct": -1.8714888990175815,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-04"
          },
          "QQQ": {
            "adjustedClose": 497.7793,
            "dailyChangePct": 1.3036106735057285,
            "cumulativeChangePct": -1.212175817886263,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-04"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-03",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-06",
        "VIX": 24.87,
        "VIX3M": 23.7,
        "ratio": 1.049367088607595,
        "currentRiskDuration": 4,
        "inversionDays": 4,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 561.6672,
            "dailyChangePct": -1.7751115040880117,
            "cumulativeChangePct": -3.613379388361415,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-06"
          },
          "QQQ": {
            "adjustedClose": 484.0856,
            "dailyChangePct": -2.7509581053290044,
            "cumulativeChangePct": -3.929787474302282,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-07",
        "VIX": 23.37,
        "VIX3M": 22.59,
        "ratio": 1.0345285524568393,
        "currentRiskDuration": 5,
        "inversionDays": 5,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 564.8153,
            "dailyChangePct": 0.5604920493843979,
            "cumulativeChangePct": -3.0731400431628697,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-06"
          },
          "QQQ": {
            "adjustedClose": 487.6454,
            "dailyChangePct": 0.7353658113358419,
            "cumulativeChangePct": -3.223319976510619,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-10",
        "VIX": 27.86,
        "VIX3M": 25.72,
        "ratio": 1.0832037325038881,
        "currentRiskDuration": 1,
        "inversionDays": 6,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 549.7711,
            "dailyChangePct": -2.6635609906459523,
            "cumulativeChangePct": -5.6548460744312194,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-10"
          },
          "QQQ": {
            "adjustedClose": 468.746,
            "dailyChangePct": -3.8756440643139545,
            "cumulativeChangePct": -6.974039631481088,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-10"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-03-10",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-11",
        "VIX": 26.92,
        "VIX3M": 25.34,
        "ratio": 1.0623520126282557,
        "currentRiskDuration": 2,
        "inversionDays": 7,
        "highStressDays": 2,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 545.2009,
            "dailyChangePct": -0.8312914229212875,
            "cumulativeChangePct": -6.439129246956354,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-11"
          },
          "QQQ": {
            "adjustedClose": 467.6255,
            "dailyChangePct": -0.23904203982541006,
            "cumulativeChangePct": -7.196410784713169,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-11"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-03-10",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-12",
        "VIX": 24.23,
        "VIX3M": 23.67,
        "ratio": 1.0236586396282212,
        "currentRiskDuration": 1,
        "inversionDays": 8,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 548.094,
            "dailyChangePct": 0.5306484270293677,
            "cumulativeChangePct": -5.9426499579903425,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-11"
          },
          "QQQ": {
            "adjustedClose": 472.9007,
            "dailyChangePct": 1.128082193977864,
            "cumulativeChangePct": -6.149510019403149,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-11"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-03-10",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-13",
        "VIX": 24.66,
        "VIX3M": 24.06,
        "ratio": 1.0249376558603491,
        "currentRiskDuration": 2,
        "inversionDays": 9,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 540.7877,
            "dailyChangePct": -1.3330377635953128,
            "cumulativeChangePct": -7.196469953487361,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 464.393,
            "dailyChangePct": -1.799045761615492,
            "cumulativeChangePct": -7.837923281654446,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-14",
        "VIX": 21.77,
        "VIX3M": 22.17,
        "ratio": 0.9819576003608479,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 551.9581,
            "dailyChangePct": 2.0655795240904995,
            "cumulativeChangePct": -5.279539239213415,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 475.6176,
            "dailyChangePct": 2.417047629916902,
            "cumulativeChangePct": -5.610321990651479,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-03-14",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-17",
        "VIX": 20.51,
        "VIX3M": 21.3,
        "ratio": 0.9629107981220658,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 556.2144,
            "dailyChangePct": 0.7711273736176638,
            "cumulativeChangePct": -4.549123837870206,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 478.7014,
            "dailyChangePct": 0.6483780246988369,
            "cumulativeChangePct": -4.998320060854877,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-03-14",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-18",
        "VIX": 21.7,
        "VIX3M": 21.97,
        "ratio": 0.9877105143377333,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 550.2026,
            "dailyChangePct": -1.0808422076091562,
            "cumulativeChangePct": -5.5807971949632496,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 470.5408,
            "dailyChangePct": -1.7047370239568926,
            "cumulativeChangePct": -6.6178488721585165,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-03-14",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-19",
        "VIX": 19.9,
        "VIX3M": 20.83,
        "ratio": 0.9553528564570332,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 556.1948,
            "dailyChangePct": 1.0890897280383616,
            "cumulativeChangePct": -4.552487355917878,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 476.8372,
            "dailyChangePct": 1.3381198824841567,
            "cumulativeChangePct": -5.368283741225466,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-20",
        "VIX": 19.8,
        "VIX3M": 20.71,
        "ratio": 0.9560598744567842,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 554.5864,
            "dailyChangePct": -0.28917925877767203,
            "cumulativeChangePct": -4.8285017655037565,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 475.221,
            "dailyChangePct": -0.33894167653026885,
            "cumulativeChangePct": -5.689030066842326,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-21",
        "VIX": 19.28,
        "VIX3M": 20.35,
        "ratio": 0.9474201474201475,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 554.7689,
            "dailyChangePct": 0.03290740631216593,
            "cumulativeChangePct": -4.797183293886354,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 476.7877,
            "dailyChangePct": 0.3296781918307401,
            "cumulativeChangePct": -5.3781073664686545,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-24",
        "VIX": 17.48,
        "VIX3M": 19.04,
        "ratio": 0.9180672268907564,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 564.7039,
            "dailyChangePct": 1.7908357876585956,
            "cumulativeChangePct": -3.09225718145425,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 487.2502,
            "dailyChangePct": 2.1943728833608844,
            "cumulativeChangePct": -3.3017502127955956,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-25",
        "VIX": 17.15,
        "VIX3M": 19.05,
        "ratio": 0.900262467191601,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 566.0614,
            "dailyChangePct": 0.2403914688742237,
            "cumulativeChangePct": -2.8592992350398916,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 490.0307,
            "dailyChangePct": 0.5706513819799364,
            "cumulativeChangePct": -2.7499403140344936,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-26",
        "VIX": 18.33,
        "VIX3M": 19.84,
        "ratio": 0.923891129032258,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 559.3036,
            "dailyChangePct": -1.1938280900269937,
            "cumulativeChangePct": -4.018992207621053,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 481.0138,
            "dailyChangePct": -1.8400683875520518,
            "cumulativeChangePct": -4.539407919191452,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-27",
        "VIX": 18.69,
        "VIX3M": 19.89,
        "ratio": 0.9396681749622926,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 557.8183,
            "dailyChangePct": -0.2655623886561709,
            "cumulativeChangePct": -4.273881664570755,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 478.273,
            "dailyChangePct": -0.5697965422197804,
            "cumulativeChangePct": -5.08333907205043,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-28",
        "VIX": 21.65,
        "VIX3M": 22.01,
        "ratio": 0.9836437982735119,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 546.5848,
            "dailyChangePct": -2.0138278001994636,
            "cumulativeChangePct": -6.201640847661471,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 465.6811,
            "dailyChangePct": -2.6327850411794085,
            "cumulativeChangePct": -7.582290722548468,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-03-31",
        "VIX": 22.28,
        "VIX3M": 21.97,
        "ratio": 1.0141101502048249,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 550.2539,
            "dailyChangePct": 0.6712773571456943,
            "cumulativeChangePct": -5.571993701297629,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 465.6612,
            "dailyChangePct": -0.004273310641123018,
            "cumulativeChangePct": -7.586240018353307,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-31",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-04",
    "monthLabel": "2025年4月",
    "status": "complete",
    "asOfDate": "2025-04-30",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2025-03-31",
      "VIX": 22.28,
      "VIX3M": 21.97,
      "ratio": 1.0141101502048249,
      "inversionDays": 1,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -0.8670179348115536,
        "baselineClose": 550.2539,
        "baselineDate": "2025-03-31"
      },
      "QQQ": {
        "monthlyChangePct": 1.396831000736154,
        "baselineClose": 465.6612,
        "baselineDate": "2025-03-31"
      },
      "vixMax": {
        "value": 52.33,
        "date": "2025-04-08"
      },
      "highStressDays": 15,
      "inversionDays": 16
    },
    "rows": [
      {
        "date": "2025-04-01",
        "VIX": 21.77,
        "VIX3M": 21.82,
        "ratio": 0.9977085242896425,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 551.8081,
            "dailyChangePct": 0.2824514283315205,
            "cumulativeChangePct": 0.2824514283315205,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 469.415,
            "dailyChangePct": 0.8061225629277358,
            "cumulativeChangePct": 0.8061225629277358,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-31",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-01",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-02",
        "VIX": 21.51,
        "VIX3M": 21.45,
        "ratio": 1.002797202797203,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 555.3001,
            "dailyChangePct": 0.6328286953381168,
            "cumulativeChangePct": 0.9170675573585196,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-03-13"
          },
          "QQQ": {
            "adjustedClose": 472.841,
            "dailyChangePct": 0.7298445938029197,
            "cumulativeChangePct": 1.5418505986755981,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-03-31",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-01",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-04-02",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-03",
        "VIX": 30.02,
        "VIX3M": 27.38,
        "ratio": 1.0964207450693937,
        "currentRiskDuration": 1,
        "inversionDays": 2,
        "highStressDays": 1,
        "extremeStressDays": 1,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 527.9344,
            "dailyChangePct": -4.928092035279674,
            "cumulativeChangePct": -4.056218411173473,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-03"
          },
          "QQQ": {
            "adjustedClose": 447.5281,
            "dailyChangePct": -5.3533640272311445,
            "cumulativeChangePct": -3.894054303858685,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-03"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-01",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-04-02",
            "sessionsAgo": 1
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-03",
            "sessionsAgo": 0
          },
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-03",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-04",
        "VIX": 45.31,
        "VIX3M": 36.71,
        "ratio": 1.2342685916643967,
        "currentRiskDuration": 2,
        "inversionDays": 3,
        "highStressDays": 2,
        "extremeStressDays": 2,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 497.0276,
            "dailyChangePct": -5.854287956988591,
            "cumulativeChangePct": -9.673043662207581,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-04"
          },
          "QQQ": {
            "adjustedClose": 419.7327,
            "dailyChangePct": -6.210872568672221,
            "cumulativeChangePct": -9.863072121963345,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-04"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-04-02",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-03",
            "sessionsAgo": 1
          },
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-03",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1_10",
            "date": "2025-04-04",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-07",
        "VIX": 46.98,
        "VIX3M": 36.88,
        "ratio": 1.2738611713665942,
        "currentRiskDuration": 3,
        "inversionDays": 4,
        "highStressDays": 3,
        "extremeStressDays": 3,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 496.1423,
            "dailyChangePct": -0.17811888112451157,
            "cumulativeChangePct": -9.833933026190289,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-07"
          },
          "QQQ": {
            "adjustedClose": 420.7456,
            "dailyChangePct": 0.2413202497684841,
            "cumulativeChangePct": -9.645553462474432,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-04-04"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-03",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-03",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1_10",
            "date": "2025-04-04",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-08",
        "VIX": 52.33,
        "VIX3M": 41.5,
        "ratio": 1.2609638554216867,
        "currentRiskDuration": 4,
        "inversionDays": 5,
        "highStressDays": 4,
        "extremeStressDays": 4,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 488.3713,
            "dailyChangePct": -1.5662845115201773,
            "cumulativeChangePct": -11.246190167847969,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 413.1686,
            "dailyChangePct": -1.8008506803160906,
            "cumulativeChangePct": -11.272702127641299,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1_10",
            "date": "2025-04-04",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-09",
        "VIX": 33.62,
        "VIX3M": 29.92,
        "ratio": 1.123663101604278,
        "currentRiskDuration": 5,
        "inversionDays": 6,
        "highStressDays": 5,
        "extremeStressDays": 5,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 539.6598,
            "dailyChangePct": 10.501948005544136,
            "cumulativeChangePct": -1.9253112063358446,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 462.7615,
            "dailyChangePct": 12.00306606068322,
            "cumulativeChangePct": -0.6227059501629051,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-10",
        "VIX": 40.72,
        "VIX3M": 35.71,
        "ratio": 1.1402968356202743,
        "currentRiskDuration": 6,
        "inversionDays": 7,
        "highStressDays": 6,
        "extremeStressDays": 6,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 516.0124,
            "dailyChangePct": -4.381908750661079,
            "cumulativeChangePct": -6.222854576769032,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 443.0793,
            "dailyChangePct": -4.253206025133904,
            "cumulativeChangePct": -4.849427008305618,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-11",
        "VIX": 37.56,
        "VIX3M": 33.91,
        "ratio": 1.107637864936597,
        "currentRiskDuration": 7,
        "inversionDays": 8,
        "highStressDays": 7,
        "extremeStressDays": 7,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "DEEP_INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 525.2195,
            "dailyChangePct": 1.7842788274080368,
            "cumulativeChangePct": -4.549608826034667,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 451.2422,
            "dailyChangePct": 1.8423112973230849,
            "cumulativeChangePct": -3.096457252611984,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-14",
        "VIX": 30.89,
        "VIX3M": 29.63,
        "ratio": 1.0425244684441446,
        "currentRiskDuration": 8,
        "inversionDays": 9,
        "highStressDays": 8,
        "extremeStressDays": 8,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 530.3149,
            "dailyChangePct": 0.970146767208746,
            "cumulativeChangePct": -3.6235999417723486,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 454.3007,
            "dailyChangePct": 0.6777956494317117,
            "cumulativeChangePct": -2.439649255724974,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-15",
        "VIX": 30.12,
        "VIX3M": 29,
        "ratio": 1.0386206896551724,
        "currentRiskDuration": 9,
        "inversionDays": 10,
        "highStressDays": 9,
        "extremeStressDays": 9,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 528.8296,
            "dailyChangePct": -0.28007887389170927,
            "cumulativeChangePct": -3.8935298777527994,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 454.8072,
            "dailyChangePct": 0.11149003292312276,
            "cumulativeChangePct": -2.330879188560264,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-16",
        "VIX": 32.64,
        "VIX3M": 30.94,
        "ratio": 1.054945054945055,
        "currentRiskDuration": 10,
        "inversionDays": 11,
        "highStressDays": 10,
        "extremeStressDays": 10,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 517.0748,
            "dailyChangePct": -2.222795395719157,
            "cumulativeChangePct": -6.029780070618318,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 441.0932,
            "dailyChangePct": -3.0153436445157444,
            "cumulativeChangePct": -5.2759388156024105,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-17",
        "VIX": 29.65,
        "VIX3M": 29.35,
        "ratio": 1.010221465076661,
        "currentRiskDuration": 1,
        "inversionDays": 12,
        "highStressDays": 11,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 517.8125,
            "dailyChangePct": 0.14266794668780225,
            "cumulativeChangePct": -5.8957146873470645,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 441.0137,
            "dailyChangePct": -0.01802340185703688,
            "cumulativeChangePct": -5.2930113138049855,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-21",
        "VIX": 33.82,
        "VIX3M": 31.83,
        "ratio": 1.0625196355639335,
        "currentRiskDuration": 1,
        "inversionDays": 13,
        "highStressDays": 12,
        "extremeStressDays": 1,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 505.4871,
            "dailyChangePct": -2.3802824381412235,
            "cumulativeChangePct": -8.135662464182447,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 430.1001,
            "dailyChangePct": -2.474662351759138,
            "cumulativeChangePct": -7.636689507307026,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-21",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-22",
        "VIX": 30.57,
        "VIX3M": 29.45,
        "ratio": 1.0380305602716469,
        "currentRiskDuration": 2,
        "inversionDays": 14,
        "highStressDays": 13,
        "extremeStressDays": 2,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 518.6388,
            "dailyChangePct": 2.6017874640124283,
            "cumulativeChangePct": -5.745547646277494,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 441.3911,
            "dailyChangePct": 2.6252028306898767,
            "cumulativeChangePct": -5.2119652657339754,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-21",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-23",
        "VIX": 28.45,
        "VIX3M": 28.02,
        "ratio": 1.015346181299072,
        "currentRiskDuration": 1,
        "inversionDays": 15,
        "highStressDays": 14,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [
          "PROLONGED_INVERSION"
        ],
        "prices": {
          "SPY": {
            "adjustedClose": 526.6753,
            "dailyChangePct": 1.5495369802644987,
            "cumulativeChangePct": -4.28504005151078,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 451.401,
            "dailyChangePct": 2.2678073934884635,
            "cumulativeChangePct": -3.06235520588789,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_30",
            "date": "2025-04-21",
            "sessionsAgo": 2
          },
          {
            "type": "INVERSION_15D",
            "date": "2025-04-23",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-24",
        "VIX": 26.47,
        "VIX3M": 26.44,
        "ratio": 1.0011346444780636,
        "currentRiskDuration": 2,
        "inversionDays": 16,
        "highStressDays": 15,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [
          "PROLONGED_INVERSION"
        ],
        "prices": {
          "SPY": {
            "adjustedClose": 537.7613,
            "dailyChangePct": 2.104902204451209,
            "cumulativeChangePct": -2.270333749565434,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 464.1022,
            "dailyChangePct": 2.8137288131838467,
            "cumulativeChangePct": -0.33479276349415166,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "INVERSION_15D",
            "date": "2025-04-23",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-25",
        "VIX": 24.84,
        "VIX3M": 25.37,
        "ratio": 0.9791091840756799,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 541.6468,
            "dailyChangePct": 0.7225324693316493,
            "cumulativeChangePct": -1.5642051787365885,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 469.2759,
            "dailyChangePct": 1.114776012697205,
            "cumulativeChangePct": 0.7762510597833616,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "INVERSION_15D",
            "date": "2025-04-23",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-25",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-28",
        "VIX": 25.15,
        "VIX3M": 25.73,
        "ratio": 0.9774582199766808,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 541.8533,
            "dailyChangePct": 0.038124475211520625,
            "cumulativeChangePct": -1.5266770485406922,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 469.127,
            "dailyChangePct": -0.03172973510890964,
            "cumulativeChangePct": 0.7442750222694139,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-25",
            "sessionsAgo": 1
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-28",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-29",
        "VIX": 24.17,
        "VIX3M": 25.22,
        "ratio": 0.9583663758921492,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 545.2667,
            "dailyChangePct": 0.6299491024600146,
            "cumulativeChangePct": -0.9063452344454159,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 472.2253,
            "dailyChangePct": 0.6604394971937211,
            "cumulativeChangePct": 1.4096300056779532,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-04-25",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-28",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-04-30",
        "VIX": 24.7,
        "VIX3M": 25.54,
        "ratio": 0.9671104150352389,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 545.4831,
            "dailyChangePct": 0.039687000874999434,
            "cumulativeChangePct": -0.8670179348115536,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 472.1657,
            "dailyChangePct": -0.01262109421075186,
            "cumulativeChangePct": 1.396831000736154,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-04-28",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-05",
    "monthLabel": "2025年5月",
    "status": "complete",
    "asOfDate": "2025-05-30",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2025-04-30",
      "VIX": 24.7,
      "VIX3M": 25.54,
      "ratio": 0.9671104150352389,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 6.2844843405781114,
        "baselineClose": 545.4831,
        "baselineDate": "2025-04-30"
      },
      "QQQ": {
        "monthlyChangePct": 9.178282115791125,
        "baselineClose": 472.1657,
        "baselineDate": "2025-04-30"
      },
      "vixMax": {
        "value": 24.76,
        "date": "2025-05-06"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-05-01",
        "VIX": 24.6,
        "VIX3M": 25.49,
        "ratio": 0.9650843468026679,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 549.3489,
            "dailyChangePct": 0.7086928999266773,
            "cumulativeChangePct": 0.7086928999266773,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 478.3326,
            "dailyChangePct": 1.3060880957680654,
            "cumulativeChangePct": 1.3060880957680654,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-02",
        "VIX": 22.68,
        "VIX3M": 24,
        "ratio": 0.945,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 557.5035,
            "dailyChangePct": 1.4844118191553735,
            "cumulativeChangePct": 2.203624640250079,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 485.4329,
            "dailyChangePct": 1.4843855509743653,
            "cumulativeChangePct": 2.8098610297190074,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-05",
        "VIX": 23.64,
        "VIX3M": 24.55,
        "ratio": 0.9629327902240326,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 554.3066,
            "dailyChangePct": -0.5734313775608624,
            "cumulativeChangePct": 1.6175569875583662,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 482.553,
            "dailyChangePct": -0.5932642801919741,
            "cumulativeChangePct": 2.199926847714684,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-06",
        "VIX": 24.76,
        "VIX3M": 25.41,
        "ratio": 0.9744195198740654,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 549.6735,
            "dailyChangePct": -0.835837062015865,
            "cumulativeChangePct": 0.7681997847412525,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-08"
          },
          "QQQ": {
            "adjustedClose": 478.0644,
            "dailyChangePct": -0.930177617795358,
            "cumulativeChangePct": 1.2492860027740083,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-07",
        "VIX": 23.55,
        "VIX3M": 24.7,
        "ratio": 0.9534412955465588,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 551.9851,
            "dailyChangePct": 0.4205405572580867,
            "cumulativeChangePct": 1.191970933654951,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 479.9413,
            "dailyChangePct": 0.39260400899963077,
            "cumulativeChangePct": 1.6467947587044174,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-08",
        "VIX": 22.48,
        "VIX3M": 23.76,
        "ratio": 0.946127946127946,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 555.8313,
            "dailyChangePct": 0.6967941707122227,
            "cumulativeChangePct": 1.8970706883494781,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 484.8966,
            "dailyChangePct": 1.0324804304193025,
            "cumulativeChangePct": 2.696278022736509,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-09",
        "VIX": 21.9,
        "VIX3M": 23.38,
        "ratio": 0.9366980325064157,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 555.123,
            "dailyChangePct": -0.1274307510210404,
            "cumulativeChangePct": 1.767222485902864,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 484.5789,
            "dailyChangePct": -0.06551912304603169,
            "cumulativeChangePct": 2.6289923219750877,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-12",
        "VIX": 18.39,
        "VIX3M": 20.22,
        "ratio": 0.9094955489614244,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 573.4684,
            "dailyChangePct": 3.304745074515014,
            "cumulativeChangePct": 5.130369758476472,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 504.3207,
            "dailyChangePct": 4.074011476768802,
            "cumulativeChangePct": 6.810109247664542,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-13",
        "VIX": 18.22,
        "VIX3M": 20.09,
        "ratio": 0.9069188651070184,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 577.2555,
            "dailyChangePct": 0.6603851232256153,
            "cumulativeChangePct": 5.824635080353535,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 512.0069,
            "dailyChangePct": 1.5240699023458593,
            "cumulativeChangePct": 8.437969975370919,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-14",
        "VIX": 18.62,
        "VIX3M": 20.58,
        "ratio": 0.9047619047619049,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 577.9933,
            "dailyChangePct": 0.12781168823856603,
            "cumulativeChangePct": 5.959891333022038,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 515.0754,
            "dailyChangePct": 0.5993083296338408,
            "cumulativeChangePct": 9.087847761919154,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-15",
        "VIX": 17.83,
        "VIX3M": 20.25,
        "ratio": 0.8804938271604937,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 580.8164,
            "dailyChangePct": 0.4884312672828628,
            "cumulativeChangePct": 6.477432573071473,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 515.6415,
            "dailyChangePct": 0.10990623897007001,
            "cumulativeChangePct": 9.207742112567674,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-16",
        "VIX": 17.24,
        "VIX3M": 20.08,
        "ratio": 0.8585657370517928,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 584.4953,
            "dailyChangePct": 0.6334015361825207,
            "cumulativeChangePct": 7.1518622666770115,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-21"
          },
          "QQQ": {
            "adjustedClose": 517.8858,
            "dailyChangePct": 0.4352442540020762,
            "cumulativeChangePct": 9.683062535038012,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-19",
        "VIX": 18.14,
        "VIX3M": 20.69,
        "ratio": 0.8767520541324311,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 585.1347,
            "dailyChangePct": 0.10939352292480553,
            "cumulativeChangePct": 7.269079463690065,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-22"
          },
          "QQQ": {
            "adjustedClose": 518.3823,
            "dailyChangePct": 0.09587055679070033,
            "cumulativeChangePct": 9.788216297795449,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-22"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-20",
        "VIX": 18.09,
        "VIX3M": 20.72,
        "ratio": 0.8730694980694981,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 583.1674,
            "dailyChangePct": -0.3362131830499715,
            "cumulativeChangePct": 6.908426677196777,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-23"
          },
          "QQQ": {
            "adjustedClose": 516.6544,
            "dailyChangePct": -0.33332542411266264,
            "cumulativeChangePct": 9.422264260195101,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-21",
        "VIX": 20.87,
        "VIX3M": 22.66,
        "ratio": 0.9210061782877317,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 573.3405,
            "dailyChangePct": -1.6850907646758118,
            "cumulativeChangePct": 5.106922652599133,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-24"
          },
          "QQQ": {
            "adjustedClose": 509.4746,
            "dailyChangePct": -1.3896717031733452,
            "cumulativeChangePct": 7.9016540167996085,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-22",
        "VIX": 20.28,
        "VIX3M": 22.32,
        "ratio": 0.9086021505376345,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 573.5668,
            "dailyChangePct": 0.039470436852084845,
            "cumulativeChangePct": 5.1484088141318995,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-25"
          },
          "QQQ": {
            "adjustedClose": 510.428,
            "dailyChangePct": 0.187133961143493,
            "cumulativeChangePct": 8.103574656100587,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-04-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-23",
        "VIX": 22.29,
        "VIX3M": 23.8,
        "ratio": 0.9365546218487394,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 569.6518,
            "dailyChangePct": -0.682570887994205,
            "cumulativeChangePct": 4.430696386377497,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-28"
          },
          "QQQ": {
            "adjustedClose": 505.701,
            "dailyChangePct": -0.9260855595696116,
            "cumulativeChangePct": 7.102443061831898,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-27",
        "VIX": 18.96,
        "VIX3M": 21.29,
        "ratio": 0.8905589478628465,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 581.4951,
            "dailyChangePct": 2.0790419691467665,
            "cumulativeChangePct": 6.601854392922513,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-04-29"
          },
          "QQQ": {
            "adjustedClose": 517.5978,
            "dailyChangePct": 2.3525363801930377,
            "cumulativeChangePct": 9.622066998937019,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-04-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-28",
        "VIX": 19.31,
        "VIX3M": 21.67,
        "ratio": 0.8910936778957083,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 578.131,
            "dailyChangePct": -0.5785259411472232,
            "cumulativeChangePct": 5.9851350115154744,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-30"
          },
          "QQQ": {
            "adjustedClose": 515.3038,
            "dailyChangePct": -0.4432012655386064,
            "cumulativeChangePct": 9.13622061068815,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-04-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-29",
        "VIX": 19.18,
        "VIX3M": 21.62,
        "ratio": 0.8871415356151711,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 580.4131,
            "dailyChangePct": 0.39473752488623504,
            "cumulativeChangePct": 6.403498110207262,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-01"
          },
          "QQQ": {
            "adjustedClose": 516.3168,
            "dailyChangePct": 0.1965830642040478,
            "cumulativeChangePct": 9.35076393732115,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-05-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-05-30",
        "VIX": 18.57,
        "VIX3M": 21.38,
        "ratio": 0.8685687558465857,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 579.7639,
            "dailyChangePct": -0.11185136930919048,
            "cumulativeChangePct": 6.2844843405781114,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-05-06"
          },
          "QQQ": {
            "adjustedClose": 515.5024,
            "dailyChangePct": -0.15773261687397344,
            "cumulativeChangePct": 9.178282115791125,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-05-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-06",
    "monthLabel": "2025年6月",
    "status": "complete",
    "asOfDate": "2025-06-30",
    "expectedSessions": 20,
    "observedSessions": 20,
    "priorSession": {
      "date": "2025-05-30",
      "VIX": 18.57,
      "VIX3M": 21.38,
      "ratio": 0.8685687558465857,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 5.140299352891753,
        "baselineClose": 579.7639,
        "baselineDate": "2025-05-30"
      },
      "QQQ": {
        "monthlyChangePct": 6.385867456679151,
        "baselineClose": 515.5024,
        "baselineDate": "2025-05-30"
      },
      "vixMax": {
        "value": 21.6,
        "date": "2025-06-17"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-06-02",
        "VIX": 18.36,
        "VIX3M": 21.09,
        "ratio": 0.8705547652916074,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 583.0297,
            "dailyChangePct": 0.5632982667599817,
            "cumulativeChangePct": 0.5632982667599817,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-06"
          },
          "QQQ": {
            "adjustedClose": 519.574,
            "dailyChangePct": 0.7898314343444346,
            "cumulativeChangePct": 0.7898314343444346,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-03",
        "VIX": 17.69,
        "VIX3M": 20.72,
        "ratio": 0.8537644787644789,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 586.3545,
            "dailyChangePct": 0.5702625440865194,
            "cumulativeChangePct": 1.1367730898732997,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-06"
          },
          "QQQ": {
            "adjustedClose": 523.6355,
            "dailyChangePct": 0.7816980834298937,
            "cumulativeChangePct": 1.5777036149589252,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-04",
        "VIX": 17.61,
        "VIX3M": 20.66,
        "ratio": 0.8523717328170377,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 586.1971,
            "dailyChangePct": -0.026843829117040308,
            "cumulativeChangePct": 1.1096241073305757,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-07"
          },
          "QQQ": {
            "adjustedClose": 525.0953,
            "dailyChangePct": 0.2787817097962275,
            "cumulativeChangePct": 1.860883673868452,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-05",
        "VIX": 18.48,
        "VIX3M": 21.11,
        "ratio": 0.8754144954997631,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 583.3641,
            "dailyChangePct": -0.4832845471258729,
            "cumulativeChangePct": 0.6209769183628033,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-05-09"
          },
          "QQQ": {
            "adjustedClose": 521.143,
            "dailyChangePct": -0.75268241783919,
            "cumulativeChangePct": 1.094194711799612,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-09"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-06",
        "VIX": 16.77,
        "VIX3M": 20.02,
        "ratio": 0.8376623376623377,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 589.3547,
            "dailyChangePct": 1.0269058380520724,
            "cumulativeChangePct": 1.654259604642494,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-05-09"
          },
          "QQQ": {
            "adjustedClose": 526.2373,
            "dailyChangePct": 0.9775244030908903,
            "cumulativeChangePct": 2.082415135215676,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-09"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-09",
        "VIX": 17.16,
        "VIX3M": 20.09,
        "ratio": 0.8541562966650075,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 589.8858,
            "dailyChangePct": 0.09011551108357718,
            "cumulativeChangePct": 1.74586586022345,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 527.0119,
            "dailyChangePct": 0.14719595133221297,
            "cumulativeChangePct": 2.2326763173168507,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-12"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-10",
        "VIX": 16.95,
        "VIX3M": 19.94,
        "ratio": 0.850050150451354,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 593.2303,
            "dailyChangePct": 0.5669741499117364,
            "cumulativeChangePct": 2.3227386182547827,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 530.4975,
            "dailyChangePct": 0.6613892399773169,
            "cumulativeChangePct": 2.908832238220427,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-11",
        "VIX": 17.26,
        "VIX3M": 20.3,
        "ratio": 0.8502463054187193,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 591.5384,
            "dailyChangePct": -0.28520121106424545,
            "cumulativeChangePct": 2.0309129285214222,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 528.71,
            "dailyChangePct": -0.33694786497577844,
            "cumulativeChangePct": 2.5620831251222276,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-12",
        "VIX": 18.02,
        "VIX3M": 20.65,
        "ratio": 0.8726392251815981,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 593.8894,
            "dailyChangePct": 0.3974382728154202,
            "cumulativeChangePct": 2.436422826602347,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 529.9513,
            "dailyChangePct": 0.23477899037278593,
            "cumulativeChangePct": 2.802877348388666,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-13",
        "VIX": 20.82,
        "VIX3M": 22.62,
        "ratio": 0.9204244031830239,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 587.2496,
            "dailyChangePct": -1.1180196177941637,
            "cumulativeChangePct": 1.2911635236343644,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 523.2979,
            "dailyChangePct": -1.255473852031297,
            "cumulativeChangePct": 1.5122141041438608,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-16",
        "VIX": 19.11,
        "VIX3M": 21.23,
        "ratio": 0.9001413094677343,
        "currentRiskDuration": 15,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 592.8368,
            "dailyChangePct": 0.9514182725709919,
            "cumulativeChangePct": 2.2548661618979837,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 530.577,
            "dailyChangePct": 1.3910050088104642,
            "cumulativeChangePct": 2.9242540868869016,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-17",
        "VIX": 21.6,
        "VIX3M": 22.91,
        "ratio": 0.9428197293758185,
        "currentRiskDuration": 16,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 587.7709,
            "dailyChangePct": -0.854518477935251,
            "cumulativeChangePct": 1.3810794359566003,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 525.4032,
            "dailyChangePct": -0.9751270786332644,
            "cumulativeChangePct": 1.9206118148043627,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-18",
        "VIX": 20.14,
        "VIX3M": 21.97,
        "ratio": 0.91670459717797,
        "currentRiskDuration": 17,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 587.6824,
            "dailyChangePct": -0.015056886960540528,
            "cumulativeChangePct": 1.3658146014265515,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 525.3138,
            "dailyChangePct": -0.017015503521855546,
            "cumulativeChangePct": 1.9032695095115182,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-20",
        "VIX": 20.62,
        "VIX3M": 22.48,
        "ratio": 0.9172597864768683,
        "currentRiskDuration": 18,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 586.3115,
            "dailyChangePct": -0.23327225726004208,
            "cumulativeChangePct": 1.1293562776157673,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 523.1688,
            "dailyChangePct": -0.4083273654718389,
            "cumulativeChangePct": 1.4871705737936614,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-23",
        "VIX": 19.83,
        "VIX3M": 21.82,
        "ratio": 0.9087992667277726,
        "currentRiskDuration": 19,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 592.1028,
            "dailyChangePct": 0.9877513915384606,
            "cumulativeChangePct": 2.1282629015017873,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-05-23"
          },
          "QQQ": {
            "adjustedClose": 528.5483,
            "dailyChangePct": 1.0282532138766731,
            "cumulativeChangePct": 2.530715666891181,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-05-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-24",
        "VIX": 17.48,
        "VIX3M": 20.05,
        "ratio": 0.8718204488778055,
        "currentRiskDuration": 20,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 598.6439,
            "dailyChangePct": 1.1047237067617344,
            "cumulativeChangePct": 3.2564980330786364,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-28"
          },
          "QQQ": {
            "adjustedClose": 536.6309,
            "dailyChangePct": 1.5292074536991107,
            "cumulativeChangePct": 4.098623013200342,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-25",
        "VIX": 16.76,
        "VIX3M": 19.67,
        "ratio": 0.8520589730554143,
        "currentRiskDuration": 21,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 598.9794,
            "dailyChangePct": 0.05604333394193528,
            "cumulativeChangePct": 3.314366417088066,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-28"
          },
          "QQQ": {
            "adjustedClose": 538.0029,
            "dailyChangePct": 0.2556692132339,
            "cumulativeChangePct": 4.364771143645507,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-26",
        "VIX": 16.59,
        "VIX3M": 19.45,
        "ratio": 0.8529562982005142,
        "currentRiskDuration": 22,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 603.6657,
            "dailyChangePct": 0.7823808297914736,
            "cumulativeChangePct": 4.122678214355879,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-30"
          },
          "QQQ": {
            "adjustedClose": 543.0333,
            "dailyChangePct": 0.93501354732477,
            "cumulativeChangePct": 5.340595892473066,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-05-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-27",
        "VIX": 16.32,
        "VIX3M": 19.45,
        "ratio": 0.8390745501285347,
        "currentRiskDuration": 23,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 606.6649,
            "dailyChangePct": 0.4968312759860316,
            "cumulativeChangePct": 4.6399922451190845,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-30"
          },
          "QQQ": {
            "adjustedClose": 544.8924,
            "dailyChangePct": 0.3423546953750245,
            "cumulativeChangePct": 5.701234368646979,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-05-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-06-30",
        "VIX": 16.73,
        "VIX3M": 19.44,
        "ratio": 0.86059670781893,
        "currentRiskDuration": 24,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 609.5655,
            "dailyChangePct": 0.47812227145498376,
            "cumulativeChangePct": 5.140299352891753,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-02"
          },
          "QQQ": {
            "adjustedClose": 548.4217,
            "dailyChangePct": 0.6477058589916096,
            "cumulativeChangePct": 6.385867456679151,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-07",
    "monthLabel": "2025年7月",
    "status": "complete",
    "asOfDate": "2025-07-31",
    "expectedSessions": 22,
    "observedSessions": 22,
    "priorSession": {
      "date": "2025-06-30",
      "VIX": 16.73,
      "VIX3M": 19.44,
      "ratio": 0.86059670781893,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 2.303148718226322,
        "baselineClose": 609.5655,
        "baselineDate": "2025-06-30"
      },
      "QQQ": {
        "monthlyChangePct": 2.4236823597607593,
        "baselineClose": 548.4217,
        "baselineDate": "2025-06-30"
      },
      "vixMax": {
        "value": 17.79,
        "date": "2025-07-07"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-07-01",
        "VIX": 16.83,
        "VIX3M": 19.51,
        "ratio": 0.8626345463864683,
        "currentRiskDuration": 25,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 609.3682,
            "dailyChangePct": -0.03236731737606968,
            "cumulativeChangePct": -0.03236731737606968,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-06-05"
          },
          "QQQ": {
            "adjustedClose": 543.7988,
            "dailyChangePct": -0.8429462218580985,
            "cumulativeChangePct": -0.8429462218580985,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-06-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-02",
        "VIX": 16.64,
        "VIX3M": 19.35,
        "ratio": 0.8599483204134366,
        "currentRiskDuration": 26,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 612.1306,
            "dailyChangePct": 0.45332198168528404,
            "cumulativeChangePct": 0.4208079361446737,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-06-05"
          },
          "QQQ": {
            "adjustedClose": 547.5866,
            "dailyChangePct": 0.6965443836948415,
            "cumulativeChangePct": -0.1522733327291803,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-06-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-03",
        "VIX": 16.38,
        "VIX3M": 19.21,
        "ratio": 0.8526808953669963,
        "currentRiskDuration": 27,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 616.9551,
            "dailyChangePct": 0.7881488035396567,
            "cumulativeChangePct": 1.2122733323982393,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-05"
          },
          "QQQ": {
            "adjustedClose": 552.975,
            "dailyChangePct": 0.9840270013911967,
            "cumulativeChangePct": 0.8302552579520617,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-07",
        "VIX": 17.79,
        "VIX3M": 20.21,
        "ratio": 0.880257298367145,
        "currentRiskDuration": 28,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 612.3575,
            "dailyChangePct": -0.7452082007264438,
            "cumulativeChangePct": 0.4580311713835439,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 548.8094,
            "dailyChangePct": -0.7533071115330747,
            "cumulativeChangePct": 0.07069377451693892,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-08",
        "VIX": 16.81,
        "VIX3M": 19.58,
        "ratio": 0.8585291113381001,
        "currentRiskDuration": 29,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 612.0221,
            "dailyChangePct": -0.05477192652983964,
            "cumulativeChangePct": 0.4030083723570277,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 549.1176,
            "dailyChangePct": 0.056157930239542075,
            "cumulativeChangePct": 0.1268914049170622,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-09",
        "VIX": 15.94,
        "VIX3M": 19.02,
        "ratio": 0.8380651945320715,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 615.6922,
            "dailyChangePct": 0.5996678878099182,
            "cumulativeChangePct": 1.0050929719611634,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 553.0048,
            "dailyChangePct": 0.7078993643620191,
            "cumulativeChangePct": 0.8356890327279265,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-10",
        "VIX": 15.78,
        "VIX3M": 18.92,
        "ratio": 0.8340380549682874,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 617.4286,
            "dailyChangePct": 0.2820240373355487,
            "cumulativeChangePct": 1.289951613075191,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 552.2095,
            "dailyChangePct": -0.1438143032393202,
            "cumulativeChangePct": 0.6906728891289404,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-11",
        "VIX": 16.4,
        "VIX3M": 19.37,
        "ratio": 0.8466701084150747,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 615.2581,
            "dailyChangePct": -0.351538623251324,
            "cumulativeChangePct": 0.9338783116826566,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 550.9668,
            "dailyChangePct": -0.22504140185926058,
            "cumulativeChangePct": 0.4640771873177352,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-14",
        "VIX": 17.2,
        "VIX3M": 19.84,
        "ratio": 0.8669354838709677,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 616.4322,
            "dailyChangePct": 0.19083048236179234,
            "cumulativeChangePct": 1.1264909185312977,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 552.9651,
            "dailyChangePct": 0.3626897301252985,
            "cumulativeChangePct": 0.8284500777412829,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-15",
        "VIX": 17.38,
        "VIX3M": 20.06,
        "ratio": 0.8664007976071785,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 613.798,
            "dailyChangePct": -0.4273300453804918,
            "cumulativeChangePct": 0.6943470389974449,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 553.4721,
            "dailyChangePct": 0.09168752241324185,
            "cumulativeChangePct": 0.9208971855052317,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-16",
        "VIX": 17.16,
        "VIX3M": 20.09,
        "ratio": 0.8541562966650075,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 615.8501,
            "dailyChangePct": 0.33432823176353654,
            "cumulativeChangePct": 1.0309966689387773,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 554.0388,
            "dailyChangePct": 0.10238998496945317,
            "cumulativeChangePct": 1.0242300769645052,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-17",
        "VIX": 16.52,
        "VIX3M": 19.69,
        "ratio": 0.8390045708481462,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 619.6189,
            "dailyChangePct": 0.6119671004356508,
            "cumulativeChangePct": 1.6492731297949037,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 558.5224,
            "dailyChangePct": 0.8092574021891341,
            "cumulativeChangePct": 1.841776136866935,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-18",
        "VIX": 16.41,
        "VIX3M": 19.58,
        "ratio": 0.838100102145046,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 619.165,
            "dailyChangePct": -0.07325470543265711,
            "cumulativeChangePct": 1.5748102541892406,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-20"
          },
          "QQQ": {
            "adjustedClose": 557.9856,
            "dailyChangePct": -0.0961107379041537,
            "cumulativeChangePct": 1.7438952543270991,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-21",
        "VIX": 16.65,
        "VIX3M": 19.51,
        "ratio": 0.8534085084572013,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 620.3391,
            "dailyChangePct": 0.18962635161872132,
            "cumulativeChangePct": 1.767422861037904,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-23"
          },
          "QQQ": {
            "adjustedClose": 560.8786,
            "dailyChangePct": 0.5184721612887522,
            "cumulativeChangePct": 2.271409027031579,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-22",
        "VIX": 16.5,
        "VIX3M": 19.53,
        "ratio": 0.8448540706605222,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 620.4279,
            "dailyChangePct": 0.01431475139967997,
            "cumulativeChangePct": 1.7819906146263165,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-24"
          },
          "QQQ": {
            "adjustedClose": 557.9757,
            "dailyChangePct": -0.5175629806521531,
            "cumulativeChangePct": 1.7420900741163203,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-06-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-23",
        "VIX": 15.37,
        "VIX3M": 18.56,
        "ratio": 0.828125,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 625.7061,
            "dailyChangePct": 0.8507354359789332,
            "cumulativeChangePct": 2.6478860762296996,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-25"
          },
          "QQQ": {
            "adjustedClose": 560.5207,
            "dailyChangePct": 0.45611305295196747,
            "cumulativeChangePct": 2.206149027290505,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-25"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-24",
        "VIX": 15.39,
        "VIX3M": 18.56,
        "ratio": 0.8292025862068967,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 625.9133,
            "dailyChangePct": 0.033114588462557215,
            "cumulativeChangePct": 2.6818775012693585,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-26"
          },
          "QQQ": {
            "adjustedClose": 561.7137,
            "dailyChangePct": 0.21283781312626537,
            "cumulativeChangePct": 2.4236823597607593,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-26"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-25",
        "VIX": 14.93,
        "VIX3M": 18.32,
        "ratio": 0.8149563318777292,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 628.5574,
            "dailyChangePct": 0.42243869877824913,
            "cumulativeChangePct": 3.1156454884667895,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-06-27"
          },
          "QQQ": {
            "adjustedClose": 563.0658,
            "dailyChangePct": 0.24070981355803767,
            "cumulativeChangePct": 2.670226214608218,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-07-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-28",
        "VIX": 15.03,
        "VIX3M": 18.16,
        "ratio": 0.8276431718061673,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 628.3995,
            "dailyChangePct": -0.02512101520084631,
            "cumulativeChangePct": 3.0897417914891756,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-07-01"
          },
          "QQQ": {
            "adjustedClose": 564.8255,
            "dailyChangePct": 0.31252120089695357,
            "cumulativeChangePct": 2.9910924385377236,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-07-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-29",
        "VIX": 15.98,
        "VIX3M": 18.77,
        "ratio": 0.8513585508790624,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 626.7421,
            "dailyChangePct": -0.2637494141863428,
            "cumulativeChangePct": 2.8178432014279053,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-07-01"
          },
          "QQQ": {
            "adjustedClose": 563.9506,
            "dailyChangePct": -0.15489739751480824,
            "cumulativeChangePct": 2.831561916678349,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-07-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-30",
        "VIX": 15.48,
        "VIX3M": 18.35,
        "ratio": 0.8435967302452315,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 625.9528,
            "dailyChangePct": -0.12593696833195223,
            "cumulativeChangePct": 2.688357526795726,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-07-08"
          },
          "QQQ": {
            "adjustedClose": 564.7062,
            "dailyChangePct": 0.13398336662819865,
            "cumulativeChangePct": 2.9693391052906914,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-07-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-07-31",
        "VIX": 16.72,
        "VIX3M": 19.14,
        "ratio": 0.8735632183908045,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 623.6047,
            "dailyChangePct": -0.3751241307651365,
            "cumulativeChangePct": 2.303148718226322,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-07-08"
          },
          "QQQ": {
            "adjustedClose": 561.7137,
            "dailyChangePct": -0.5299215769191012,
            "cumulativeChangePct": 2.4236823597607593,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-07-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-08",
    "monthLabel": "2025年8月",
    "status": "complete",
    "asOfDate": "2025-08-29",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2025-07-31",
      "VIX": 16.72,
      "VIX3M": 19.14,
      "ratio": 0.8735632183908045,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 2.051956952858114,
        "baselineClose": 623.6047,
        "baselineDate": "2025-07-31"
      },
      "QQQ": {
        "monthlyChangePct": 0.953973527795382,
        "baselineClose": 561.7137,
        "baselineDate": "2025-07-31"
      },
      "vixMax": {
        "value": 20.38,
        "date": "2025-08-01"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-08-01",
        "VIX": 20.38,
        "VIX3M": 21.24,
        "ratio": 0.9595103578154426,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 613.3836,
            "dailyChangePct": -1.6390351131093106,
            "cumulativeChangePct": -1.6390351131093106,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-07-08"
          },
          "QQQ": {
            "adjustedClose": 550.6487,
            "dailyChangePct": -1.9698647193401309,
            "cumulativeChangePct": -1.9698647193401309,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-07-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-04",
        "VIX": 17.52,
        "VIX3M": 19.61,
        "ratio": 0.8934217236104028,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 622.7069,
            "dailyChangePct": 1.5199786887031275,
            "cumulativeChangePct": -0.1439694088258059,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-07-08"
          },
          "QQQ": {
            "adjustedClose": 560.809,
            "dailyChangePct": 1.8451510009920957,
            "cumulativeChangePct": -0.16106069693512248,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-07-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-05",
        "VIX": 17.85,
        "VIX3M": 20.03,
        "ratio": 0.8911632551173241,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 619.5498,
            "dailyChangePct": -0.5069961485893337,
            "cumulativeChangePct": -0.6502356380572505,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 557.0014,
            "dailyChangePct": -0.6789477344336436,
            "cumulativeChangePct": -0.8389149134158558,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-06",
        "VIX": 16.77,
        "VIX3M": 19.47,
        "ratio": 0.8613251155624038,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 624.2953,
            "dailyChangePct": 0.7659594111724344,
            "cumulativeChangePct": 0.11074323205069181,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 564.0102,
            "dailyChangePct": 1.2583092250755712,
            "cumulativeChangePct": 0.408838167913661,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-07",
        "VIX": 16.57,
        "VIX3M": 19.35,
        "ratio": 0.8563307493540051,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 623.7724,
            "dailyChangePct": -0.08375843931550664,
            "cumulativeChangePct": 0.026892035932379876,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 565.919,
            "dailyChangePct": 0.3384335957044682,
            "cumulativeChangePct": 0.748655409330401,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-08",
        "VIX": 15.15,
        "VIX3M": 18.7,
        "ratio": 0.8101604278074866,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 628.6363,
            "dailyChangePct": 0.7797555646899434,
            "cumulativeChangePct": 0.8068572927689699,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 571.1981,
            "dailyChangePct": 0.932836678040494,
            "cumulativeChangePct": 1.6884758196212601,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-11",
        "VIX": 16.25,
        "VIX3M": 19.25,
        "ratio": 0.8441558441558441,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 627.3932,
            "dailyChangePct": -0.19774550085638332,
            "cumulativeChangePct": 0.6075162679177959,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 569.508,
            "dailyChangePct": -0.2958868385591451,
            "cumulativeChangePct": 1.3875930033396155,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-12",
        "VIX": 14.73,
        "VIX3M": 18.34,
        "ratio": 0.8031624863685932,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 634.0724,
            "dailyChangePct": 1.064595535941426,
            "cumulativeChangePct": 1.678579394927593,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 576.666,
            "dailyChangePct": 1.2568743547061612,
            "cumulativeChangePct": 2.6619076586524404,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-13",
        "VIX": 14.49,
        "VIX3M": 18.33,
        "ratio": 0.7905073649754502,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 636.2429,
            "dailyChangePct": 0.3423110673165919,
            "cumulativeChangePct": 2.026636425286732,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 576.9543,
            "dailyChangePct": 0.04999427745002727,
            "cumulativeChangePct": 2.7132327376028,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-14",
        "VIX": 14.83,
        "VIX3M": 18.49,
        "ratio": 0.8020551649540293,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 636.3021,
            "dailyChangePct": 0.00930462249559838,
            "cumulativeChangePct": 2.0361296186510502,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 576.5069,
            "dailyChangePct": -0.07754513659053996,
            "cumulativeChangePct": 2.6335836209798513,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-15",
        "VIX": 15.09,
        "VIX3M": 18.64,
        "ratio": 0.8095493562231759,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 634.8124,
            "dailyChangePct": -0.23411835353049915,
            "cumulativeChangePct": 1.7972443119816273,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 573.9718,
            "dailyChangePct": -0.4397345461086277,
            "cumulativeChangePct": 2.182268297889123,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-18",
        "VIX": 14.99,
        "VIX3M": 18.45,
        "ratio": 0.8124661246612467,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 634.6742,
            "dailyChangePct": -0.021770211167893017,
            "cumulativeChangePct": 1.7750828369317961,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 573.7431,
            "dailyChangePct": -0.03984516312474096,
            "cumulativeChangePct": 2.1415536064012697,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-19",
        "VIX": 15.57,
        "VIX3M": 18.9,
        "ratio": 0.8238095238095239,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 631.231,
            "dailyChangePct": -0.5425145688922051,
            "cumulativeChangePct": 1.222938185039335,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 565.9588,
            "dailyChangePct": -1.3567570572962095,
            "cumulativeChangePct": 0.7557408694144341,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-20",
        "VIX": 15.69,
        "VIX3M": 19.1,
        "ratio": 0.8214659685863873,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 629.5538,
            "dailyChangePct": -0.26570304690358704,
            "cumulativeChangePct": 0.9539857541163599,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 562.5985,
            "dailyChangePct": -0.5937357984362235,
            "cumulativeChangePct": 0.15751796689309483,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-21",
        "VIX": 16.6,
        "VIX3M": 19.41,
        "ratio": 0.8552292632663576,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 627.0282,
            "dailyChangePct": -0.4011730212731712,
            "cumulativeChangePct": 0.5489855993708881,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 559.9938,
            "dailyChangePct": -0.4629767054124656,
            "cumulativeChangePct": -0.30618801001294216,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-22",
        "VIX": 14.22,
        "VIX3M": 17.76,
        "ratio": 0.8006756756756757,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 636.6573,
            "dailyChangePct": 1.53567255826772,
            "cumulativeChangePct": 2.0930887788369823,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 568.6331,
            "dailyChangePct": 1.5427492232949813,
            "cumulativeChangePct": 1.2318375001357351,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-25",
        "VIX": 14.79,
        "VIX3M": 18.02,
        "ratio": 0.820754716981132,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 633.8554,
            "dailyChangePct": -0.4400954799387291,
            "cumulativeChangePct": 1.643781709791492,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 566.9927,
            "dailyChangePct": -0.28848127201881457,
            "cumulativeChangePct": 0.939802607627338,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-26",
        "VIX": 14.62,
        "VIX3M": 17.9,
        "ratio": 0.8167597765363128,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 636.5093,
            "dailyChangePct": 0.41869170791950516,
            "cumulativeChangePct": 2.0693557954261754,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 569.2694,
            "dailyChangePct": 0.4015395612677164,
            "cumulativeChangePct": 1.3451158481625036,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-27",
        "VIX": 14.85,
        "VIX3M": 17.94,
        "ratio": 0.8277591973244146,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 637.9596,
            "dailyChangePct": 0.22785213036164986,
            "cumulativeChangePct": 2.3019229970524746,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 570.1442,
            "dailyChangePct": 0.153670652243032,
            "cumulativeChangePct": 1.5008535487028185,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-28",
        "VIX": 14.43,
        "VIX3M": 17.72,
        "ratio": 0.8143340857787811,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 640.2189,
            "dailyChangePct": 0.35414468251593334,
            "cumulativeChangePct": 2.66421981745808,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-08-01"
          },
          "QQQ": {
            "adjustedClose": 573.7133,
            "dailyChangePct": 0.6259995278387498,
            "cumulativeChangePct": 2.1362484126700165,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-08-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-08-29",
        "VIX": 15.36,
        "VIX3M": 18.35,
        "ratio": 0.8370572207084468,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 636.4008,
            "dailyChangePct": -0.5963741464052319,
            "cumulativeChangePct": 2.051956952858114,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-08-05"
          },
          "QQQ": {
            "adjustedClose": 567.0723,
            "dailyChangePct": -1.157546809530119,
            "cumulativeChangePct": 0.953973527795382,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-08-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-09",
    "monthLabel": "2025年9月",
    "status": "complete",
    "asOfDate": "2025-09-30",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2025-08-29",
      "VIX": 15.36,
      "VIX3M": 18.35,
      "ratio": 0.8370572207084468,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 3.562047690700587,
        "baselineClose": 636.4008,
        "baselineDate": "2025-08-29"
      },
      "QQQ": {
        "monthlyChangePct": 5.376210405621995,
        "baselineClose": 567.0723,
        "baselineDate": "2025-08-29"
      },
      "vixMax": {
        "value": 17.17,
        "date": "2025-09-02"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-09-02",
        "VIX": 17.17,
        "VIX3M": 19.38,
        "ratio": 0.8859649122807018,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 631.6849,
            "dailyChangePct": -0.7410267240393176,
            "cumulativeChangePct": -0.7410267240393176,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-08-05"
          },
          "QQQ": {
            "adjustedClose": 562.3202,
            "dailyChangePct": -0.8380060179275284,
            "cumulativeChangePct": -0.8380060179275284,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-08-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-03",
        "VIX": 16.35,
        "VIX3M": 18.93,
        "ratio": 0.8637083993660857,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 635.1083,
            "dailyChangePct": 0.5419474171378891,
            "cumulativeChangePct": -0.20309528209266903,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-08-07"
          },
          "QQQ": {
            "adjustedClose": 566.7442,
            "dailyChangePct": 0.7867403660761108,
            "cumulativeChangePct": -0.057858583464587277,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-04",
        "VIX": 15.3,
        "VIX3M": 18.39,
        "ratio": 0.831973898858075,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 640.4162,
            "dailyChangePct": 0.835747226103023,
            "cumulativeChangePct": 0.630954580823917,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-08-07"
          },
          "QQQ": {
            "adjustedClose": 571.8741,
            "dailyChangePct": 0.9051526244115093,
            "cumulativeChangePct": 0.8467703324602338,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-05",
        "VIX": 15.18,
        "VIX3M": 18.42,
        "ratio": 0.8241042345276872,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 638.5614,
            "dailyChangePct": -0.2896241537924782,
            "cumulativeChangePct": 0.33950303016589967,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 572.6993,
            "dailyChangePct": 0.1442974948506981,
            "cumulativeChangePct": 0.9922896956878313,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-08",
        "VIX": 15.11,
        "VIX3M": 18.29,
        "ratio": 0.8261344997266266,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 640.1301,
            "dailyChangePct": 0.24566157616165984,
            "cumulativeChangePct": 0.5859986348225821,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 575.4929,
            "dailyChangePct": 0.4877952531110008,
            "cumulativeChangePct": 1.484925290831507,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-09",
        "VIX": 15.04,
        "VIX3M": 18.27,
        "ratio": 0.823207443897099,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 641.61,
            "dailyChangePct": 0.2311873789406338,
            "cumulativeChangePct": 0.8185407686476909,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 577.1233,
            "dailyChangePct": 0.2833049721377989,
            "cumulativeChangePct": 1.7724371301507613,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-10",
        "VIX": 15.35,
        "VIX3M": 18.44,
        "ratio": 0.8324295010845986,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 643.4648,
            "dailyChangePct": 0.28908526986797245,
            "cumulativeChangePct": 1.109992319305686,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 577.3122,
            "dailyChangePct": 0.032731307157418676,
            "cumulativeChangePct": 1.8057485791494132,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-11",
        "VIX": 14.71,
        "VIX3M": 18.03,
        "ratio": 0.8158624514697725,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 648.8121,
            "dailyChangePct": 0.8310167082954623,
            "cumulativeChangePct": 1.950233249235378,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 580.6725,
            "dailyChangePct": 0.582059412567415,
            "cumulativeChangePct": 2.398318521289089,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-12",
        "VIX": 14.76,
        "VIX3M": 18.06,
        "ratio": 0.8172757475083057,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 648.595,
            "dailyChangePct": -0.033461151541402945,
            "cumulativeChangePct": 1.9161195271910403,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 583.2374,
            "dailyChangePct": 0.4417119805053549,
            "cumulativeChangePct": 2.8506241620336548,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-15",
        "VIX": 15.69,
        "VIX3M": 18.53,
        "ratio": 0.8467350242849433,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 652.0481,
            "dailyChangePct": 0.5323969503310932,
            "cumulativeChangePct": 2.458717839449598,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 588.2281,
            "dailyChangePct": 0.8556892956453233,
            "cumulativeChangePct": 3.7307059434925627,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-16",
        "VIX": 16.36,
        "VIX3M": 18.91,
        "ratio": 0.8651507139079851,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 651.1503,
            "dailyChangePct": -0.13768922875474487,
            "cumulativeChangePct": 2.3176432210644693,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 587.731,
            "dailyChangePct": -0.08450803353325931,
            "cumulativeChangePct": 3.6430451637295524,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-17",
        "VIX": 15.72,
        "VIX3M": 18.44,
        "ratio": 0.8524945770065075,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 650.3413,
            "dailyChangePct": -0.12424166893572064,
            "cumulativeChangePct": 2.1905220735109143,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 586.5579,
            "dailyChangePct": -0.19959811546438333,
            "cumulativeChangePct": 3.4361755987728504,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-18",
        "VIX": 15.7,
        "VIX3M": 18.52,
        "ratio": 0.8477321814254859,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 653.38,
            "dailyChangePct": 0.467246967092505,
            "cumulativeChangePct": 2.668004188555395,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-08-21"
          },
          "QQQ": {
            "adjustedClose": 591.8469,
            "dailyChangePct": 0.9017012642741573,
            "cumulativeChangePct": 4.368860901863836,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-08-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-19",
        "VIX": 15.45,
        "VIX3M": 18.48,
        "ratio": 0.836038961038961,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 656.6162,
            "dailyChangePct": 0.49530135602560144,
            "cumulativeChangePct": 3.1765202055057173,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 595.8534,
            "dailyChangePct": 0.6769487176497835,
            "cumulativeChangePct": 5.075384567364671,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-22",
        "VIX": 16.1,
        "VIX3M": 18.95,
        "ratio": 0.849604221635884,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 659.7227,
            "dailyChangePct": 0.4731074256163703,
            "cumulativeChangePct": 3.664655984090537,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 599.3807,
            "dailyChangePct": 0.5919744688878348,
            "cumulativeChangePct": 5.69740401708918,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-23",
        "VIX": 16.64,
        "VIX3M": 19.44,
        "ratio": 0.8559670781893004,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 656.1314,
            "dailyChangePct": -0.5443650794492938,
            "cumulativeChangePct": 3.1003417971819047,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 595.3995,
            "dailyChangePct": -0.6642189179598357,
            "cumulativeChangePct": 4.99534186381525,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-24",
        "VIX": 16.18,
        "VIX3M": 19.14,
        "ratio": 0.845350052246604,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 654.044,
            "dailyChangePct": -0.3181374950200544,
            "cumulativeChangePct": 2.7723409524312403,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 593.3093,
            "dailyChangePct": -0.35105840700235813,
            "cumulativeChangePct": 4.626746889241451,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-25",
        "VIX": 16.74,
        "VIX3M": 19.46,
        "ratio": 0.8602261048304213,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 651.0265,
            "dailyChangePct": -0.46136039777139315,
            "cumulativeChangePct": 2.298190071414119,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 590.7513,
            "dailyChangePct": -0.4311410591406495,
            "cumulativeChangePct": 4.17565802455877,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-26",
        "VIX": 15.29,
        "VIX3M": 18.41,
        "ratio": 0.830526887561108,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 654.7563,
            "dailyChangePct": 0.5729106265259576,
            "cumulativeChangePct": 2.884267273076957,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 593.1799,
            "dailyChangePct": 0.41110362347065443,
            "cumulativeChangePct": 4.603927929472129,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-29",
        "VIX": 16.12,
        "VIX3M": 18.76,
        "ratio": 0.8592750533049041,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 656.5964,
            "dailyChangePct": 0.28103586021241966,
            "cumulativeChangePct": 3.1734089586310965,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-02"
          },
          "QQQ": {
            "adjustedClose": 595.927,
            "dailyChangePct": 0.463114141257992,
            "cumulativeChangePct": 5.0883635120248405,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-09-30",
        "VIX": 16.28,
        "VIX3M": 18.77,
        "ratio": 0.8673415023974428,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 659.0697,
            "dailyChangePct": 0.37668497725542593,
            "cumulativeChangePct": 3.562047690700587,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-03"
          },
          "QQQ": {
            "adjustedClose": 597.5593,
            "dailyChangePct": 0.2739093882304422,
            "cumulativeChangePct": 5.376210405621995,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-03"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-10",
    "monthLabel": "2025年10月",
    "status": "complete",
    "asOfDate": "2025-10-31",
    "expectedSessions": 23,
    "observedSessions": 23,
    "priorSession": {
      "date": "2025-09-30",
      "VIX": 16.28,
      "VIX3M": 18.77,
      "ratio": 0.8673415023974428,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 2.383753948937417,
        "baselineClose": 659.0697,
        "baselineDate": "2025-09-30"
      },
      "QQQ": {
        "monthlyChangePct": 4.780379118859002,
        "baselineClose": 597.5593,
        "baselineDate": "2025-09-30"
      },
      "vixMax": {
        "value": 25.31,
        "date": "2025-10-16"
      },
      "highStressDays": 1,
      "inversionDays": 1
    },
    "rows": [
      {
        "date": "2025-10-01",
        "VIX": 16.29,
        "VIX3M": 18.76,
        "ratio": 0.8683368869936033,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 661.3155,
            "dailyChangePct": 0.34075303416316594,
            "cumulativeChangePct": 0.34075303416316594,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-09-05"
          },
          "QQQ": {
            "adjustedClose": 600.4258,
            "dailyChangePct": 0.47970134512171914,
            "cumulativeChangePct": 0.47970134512171914,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-04"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-02",
        "VIX": 16.63,
        "VIX3M": 18.89,
        "ratio": 0.8803599788247749,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 662.0773,
            "dailyChangePct": 0.11519463856510814,
            "cumulativeChangePct": 0.45634020195437497,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-05"
          },
          "QQQ": {
            "adjustedClose": 602.8942,
            "dailyChangePct": 0.4111082501784491,
            "cumulativeChangePct": 0.8927816871061811,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-03",
        "VIX": 16.65,
        "VIX3M": 19.08,
        "ratio": 0.8726415094339622,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 662.0674,
            "dailyChangePct": -0.0014952936764345282,
            "cumulativeChangePct": 0.454838084651743,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-08"
          },
          "QQQ": {
            "adjustedClose": 600.3561,
            "dailyChangePct": -0.42098597067279364,
            "cumulativeChangePct": 0.46803723078194803,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-06",
        "VIX": 16.37,
        "VIX3M": 19.12,
        "ratio": 0.8561715481171548,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.4418,
            "dailyChangePct": 0.35863418135373415,
            "cumulativeChangePct": 0.8151034708468563,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-09"
          },
          "QQQ": {
            "adjustedClose": 604.8649,
            "dailyChangePct": 0.7510209357413089,
            "cumulativeChangePct": 1.222573224113499,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-09"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-07",
        "VIX": 17.24,
        "VIX3M": 19.71,
        "ratio": 0.8746829020801622,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 661.9784,
            "dailyChangePct": -0.37074729494742664,
            "cumulativeChangePct": 0.44133420183023464,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-10"
          },
          "QQQ": {
            "adjustedClose": 601.6799,
            "dailyChangePct": -0.5265638657492078,
            "cumulativeChangePct": 0.6895717295337889,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-08",
        "VIX": 16.3,
        "VIX3M": 19.26,
        "ratio": 0.8463136033229491,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 665.9258,
            "dailyChangePct": 0.5963034443419835,
            "cumulativeChangePct": 1.0402693372188132,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-09-12"
          },
          "QQQ": {
            "adjustedClose": 608.5775,
            "dailyChangePct": 1.1463902982300045,
            "cumulativeChangePct": 1.8438672111705134,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-11"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-09",
        "VIX": 16.43,
        "VIX3M": 19.38,
        "ratio": 0.847781217750258,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 663.9966,
            "dailyChangePct": -0.2897019457723471,
            "cumulativeChangePct": 0.747553710935267,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-12"
          },
          "QQQ": {
            "adjustedClose": 607.8409,
            "dailyChangePct": -0.1210363511631507,
            "cumulativeChangePct": 1.7205991104146445,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-09-12"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-10",
        "VIX": 21.66,
        "VIX3M": 22.81,
        "ratio": 0.9495835160017537,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 646.0502,
            "dailyChangePct": -2.7027849238986934,
            "cumulativeChangePct": -1.975435981960627,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 586.7402,
            "dailyChangePct": -3.471418260929804,
            "cumulativeChangePct": -1.8105483422314772,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-09-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-13",
        "VIX": 19.03,
        "VIX3M": 20.93,
        "ratio": 0.9092212135690397,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 655.9633,
            "dailyChangePct": 1.5344163657870613,
            "cumulativeChangePct": -0.471331029176425,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 599.1916,
            "dailyChangePct": 2.1221317373515625,
            "cumulativeChangePct": 0.27316117412949925,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-09-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-14",
        "VIX": 20.81,
        "VIX3M": 22.03,
        "ratio": 0.9446209714026327,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 655.1619,
            "dailyChangePct": -0.1221714690440856,
            "cumulativeChangePct": -0.5929266661781063,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 595.2004,
            "dailyChangePct": -0.6660974553047927,
            "cumulativeChangePct": -0.3947558008050467,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-09-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-15",
        "VIX": 20.64,
        "VIX3M": 21.94,
        "ratio": 0.9407474931631723,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 658.0705,
            "dailyChangePct": 0.4439513347769708,
            "cumulativeChangePct": -0.15160763724989534,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 599.4006,
            "dailyChangePct": 0.7056782891947222,
            "cumulativeChangePct": 0.30813678240804165,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-16",
        "VIX": 25.31,
        "VIX3M": 24.87,
        "ratio": 1.0176919983916364,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 653.5889,
            "dailyChangePct": -0.6810212583606257,
            "cumulativeChangePct": -0.8315964153715494,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 597.1811,
            "dailyChangePct": -0.37028658296305306,
            "cumulativeChangePct": -0.06329078971744062,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-10-16",
            "sessionsAgo": 0
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-10-16",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-17",
        "VIX": 20.78,
        "VIX3M": 22.09,
        "ratio": 0.9406971480307832,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 657.2989,
            "dailyChangePct": 0.5676350990660994,
            "cumulativeChangePct": -0.26868174944167933,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 601.1026,
            "dailyChangePct": 0.65666847125605,
            "cumulativeChangePct": 0.5929620708773342,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-10-16",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-10-16",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-10-17",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-20",
        "VIX": 18.23,
        "VIX3M": 20.31,
        "ratio": 0.8975873953717382,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.1351,
            "dailyChangePct": 1.0400443390366165,
            "cumulativeChangePct": 0.7685681802698463,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 608.677,
            "dailyChangePct": 1.260084384928617,
            "cumulativeChangePct": 1.8605182782696295,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-10-16",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-10-16",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-10-17",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-21",
        "VIX": 17.87,
        "VIX3M": 19.99,
        "ratio": 0.8939469734867435,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.1252,
            "dailyChangePct": -0.0014906605598774547,
            "cumulativeChangePct": 0.7670660629672366,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 608.5178,
            "dailyChangePct": -0.026155087180890213,
            "cumulativeChangePct": 1.8338765709110305,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-10-17",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-22",
        "VIX": 18.6,
        "VIX3M": 20.31,
        "ratio": 0.9158050221565732,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 660.6725,
            "dailyChangePct": -0.5198869128893113,
            "cumulativeChangePct": 0.2431912740033404,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 602.6553,
            "dailyChangePct": -0.9634064936144715,
            "cumulativeChangePct": 0.8528023913275229,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-23",
        "VIX": 17.3,
        "VIX3M": 19.65,
        "ratio": 0.8804071246819339,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.5902,
            "dailyChangePct": 0.5929866915907578,
            "cumulativeChangePct": 0.8376200574840453,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 607.7215,
            "dailyChangePct": 0.8406463860850533,
            "cumulativeChangePct": 1.7006178298957009,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-24",
        "VIX": 16.37,
        "VIX3M": 19.2,
        "ratio": 0.8526041666666667,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 670.0216,
            "dailyChangePct": 0.8172555057236908,
            "cumulativeChangePct": 1.6617210592445808,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 614.211,
            "dailyChangePct": 1.067841108139178,
            "cumulativeChangePct": 2.786618834314858,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-27",
        "VIX": 15.79,
        "VIX3M": 18.99,
        "ratio": 0.8314902580305424,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 677.9263,
            "dailyChangePct": 1.1797679358396707,
            "cumulativeChangePct": 2.8610934473243033,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 625.1495,
            "dailyChangePct": 1.780902653973948,
            "cumulativeChangePct": 4.617148457065268,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-28",
        "VIX": 16.42,
        "VIX3M": 19.55,
        "ratio": 0.8398976982097187,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 679.7269,
            "dailyChangePct": 0.2656040929522874,
            "cumulativeChangePct": 3.13429672157588,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 629.9569,
            "dailyChangePct": 0.7690000551868081,
            "cumulativeChangePct": 5.42165438643496,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-29",
        "VIX": 16.92,
        "VIX3M": 19.83,
        "ratio": 0.8532526475037823,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.0534,
            "dailyChangePct": 0.04803399718327217,
            "cumulativeChangePct": 3.1838362467581094,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 632.7936,
            "dailyChangePct": 0.45030064755222643,
            "cumulativeChangePct": 5.896368778797334,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-30",
        "VIX": 16.91,
        "VIX3M": 19.98,
        "ratio": 0.8463463463463463,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 672.5741,
            "dailyChangePct": -1.0998106913368777,
            "cumulativeChangePct": 2.0490093839847345,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 623.1191,
            "dailyChangePct": -1.5288555383619507,
            "cumulativeChangePct": 4.277366279798511,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-10-31",
        "VIX": 17.44,
        "VIX3M": 20.49,
        "ratio": 0.8511469009272817,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 674.7803,
            "dailyChangePct": 0.32802333601604783,
            "cumulativeChangePct": 2.383753948937417,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 626.1249,
            "dailyChangePct": 0.48237969274254056,
            "cumulativeChangePct": 4.780379118859002,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-11",
    "monthLabel": "2025年11月",
    "status": "complete",
    "asOfDate": "2025-11-28",
    "expectedSessions": 19,
    "observedSessions": 19,
    "priorSession": {
      "date": "2025-10-31",
      "VIX": 17.44,
      "VIX3M": 20.49,
      "ratio": 0.8511469009272817,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 0.19499680118106877,
        "baselineClose": 674.7803,
        "baselineDate": "2025-10-31"
      },
      "QQQ": {
        "monthlyChangePct": -1.561030395053764,
        "baselineClose": 626.1249,
        "baselineDate": "2025-10-31"
      },
      "vixMax": {
        "value": 26.42,
        "date": "2025-11-20"
      },
      "highStressDays": 1,
      "inversionDays": 2
    },
    "rows": [
      {
        "date": "2025-11-03",
        "VIX": 17.17,
        "VIX3M": 20.38,
        "ratio": 0.8424926398429834,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.0466,
            "dailyChangePct": 0.1876610802064027,
            "cumulativeChangePct": 0.1876610802064027,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 629.1208,
            "dailyChangePct": 0.47848280750373284,
            "cumulativeChangePct": 0.47848280750373284,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-04",
        "VIX": 19,
        "VIX3M": 21.29,
        "ratio": 0.8924377642085487,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 668.033,
            "dailyChangePct": -1.1853620741528736,
            "cumulativeChangePct": -0.9999254572191862,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 616.3509,
            "dailyChangePct": -2.029800953966232,
            "cumulativeChangePct": -1.561030395053764,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-05",
        "VIX": 18.01,
        "VIX3M": 20.6,
        "ratio": 0.8742718446601941,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 670.3481,
            "dailyChangePct": 0.34655473606843845,
            "cumulativeChangePct": -0.6568360101799064,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 620.362,
            "dailyChangePct": 0.6507818841507307,
            "cumulativeChangePct": -0.9204074139201435,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-06",
        "VIX": 19.5,
        "VIX3M": 21.35,
        "ratio": 0.9133489461358313,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 663.1557,
            "dailyChangePct": -1.0729350914845615,
            "cumulativeChangePct": -1.7227236776177324,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-10-10"
          },
          "QQQ": {
            "adjustedClose": 608.8064,
            "dailyChangePct": -1.8627188641470505,
            "cumulativeChangePct": -2.765981675541085,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-10-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-07",
        "VIX": 19.08,
        "VIX3M": 21.19,
        "ratio": 0.9004247286455874,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 663.8086,
            "dailyChangePct": 0.09845350043737877,
            "cumulativeChangePct": -1.625966258943845,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-10-16"
          },
          "QQQ": {
            "adjustedClose": 606.8854,
            "dailyChangePct": -0.31553544772198183,
            "cumulativeChangePct": -3.0727894705992354,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-10-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-10",
        "VIX": 17.6,
        "VIX3M": 20.24,
        "ratio": 0.8695652173913044,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 674.1669,
            "dailyChangePct": 1.560434739772898,
            "cumulativeChangePct": -0.09090366153249319,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-10-16"
          },
          "QQQ": {
            "adjustedClose": 620.3123,
            "dailyChangePct": 2.2124275851750586,
            "cumulativeChangePct": -0.9283451273060628,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-10-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-11",
        "VIX": 17.28,
        "VIX3M": 20.19,
        "ratio": 0.8558692421991084,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 675.7102,
            "dailyChangePct": 0.2289195746631778,
            "cumulativeChangePct": 0.13780781685535093,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-10-16"
          },
          "QQQ": {
            "adjustedClose": 618.6601,
            "dailyChangePct": -0.2663497080422239,
            "cumulativeChangePct": -1.1922221908120867,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2025-10-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-12",
        "VIX": 17.51,
        "VIX3M": 20.34,
        "ratio": 0.86086529006883,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.0862,
            "dailyChangePct": 0.05564515675506865,
            "cumulativeChangePct": 0.19352965698613556,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-10-16"
          },
          "QQQ": {
            "adjustedClose": 618.1723,
            "dailyChangePct": -0.07884781966707166,
            "cumulativeChangePct": -1.2701299692761125,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-10-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-13",
        "VIX": 20,
        "VIX3M": 21.85,
        "ratio": 0.9153318077803203,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.8672,
            "dailyChangePct": -1.6594037860852562,
            "cumulativeChangePct": -1.4690855675543513,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-10-17"
          },
          "QQQ": {
            "adjustedClose": 605.5517,
            "dailyChangePct": -2.041599081679968,
            "cumulativeChangePct": -3.2857980891672023,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-10-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-14",
        "VIX": 19.83,
        "VIX3M": 21.58,
        "ratio": 0.9189063948100092,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.7584,
            "dailyChangePct": -0.016364170168114978,
            "cumulativeChangePct": -1.4852093340602779,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-10-22"
          },
          "QQQ": {
            "adjustedClose": 606.0096,
            "dailyChangePct": 0.07561699521279053,
            "cumulativeChangePct": -3.2126657157381944,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-10-22"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-17",
        "VIX": 22.38,
        "VIX3M": 23.18,
        "ratio": 0.9654874892148404,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 658.5652,
            "dailyChangePct": -0.931646745644743,
            "cumulativeChangePct": -2.4030191752782315,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-17"
          },
          "QQQ": {
            "adjustedClose": 600.8339,
            "dailyChangePct": -0.8540623778897194,
            "cumulativeChangePct": -4.03928992442244,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-18",
        "VIX": 24.69,
        "VIX3M": 24.54,
        "ratio": 1.0061124694376529,
        "currentRiskDuration": 2,
        "inversionDays": 1,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 653.0349,
            "dailyChangePct": -0.8397498076120669,
            "cumulativeChangePct": -3.222589633989026,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-18"
          },
          "QQQ": {
            "adjustedClose": 593.5183,
            "dailyChangePct": -1.217574441122582,
            "cumulativeChangePct": -5.2076830038224164,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-18"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-18",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-19",
        "VIX": 23.66,
        "VIX3M": 23.99,
        "ratio": 0.9862442684451855,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 655.5576,
            "dailyChangePct": 0.3863040091731662,
            "cumulativeChangePct": -2.8487346177711537,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-11-18"
          },
          "QQQ": {
            "adjustedClose": 597.0616,
            "dailyChangePct": 0.5969992837626226,
            "cumulativeChangePct": -4.641773550293249,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-11-18"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-18",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-19",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-20",
        "VIX": 26.42,
        "VIX3M": 25.76,
        "ratio": 1.0256211180124224,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 645.5654,
            "dailyChangePct": -1.5242291447769118,
            "cumulativeChangePct": -4.329542519246643,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 582.9281,
            "dailyChangePct": -2.367176184165931,
            "cumulativeChangePct": -6.899070776453719,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-18",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-19",
            "sessionsAgo": 1
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-11-20",
            "sessionsAgo": 0
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-20",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-21",
        "VIX": 23.43,
        "VIX3M": 23.96,
        "ratio": 0.9778797996661102,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 651.9961,
            "dailyChangePct": 0.9961345512011555,
            "cumulativeChangePct": -3.376536036988642,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 587.3075,
            "dailyChangePct": 0.7512761865485773,
            "cumulativeChangePct": -6.19962566574177,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-19",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2025-11-20",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-20",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-21",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-24",
        "VIX": 20.52,
        "VIX3M": 21.85,
        "ratio": 0.9391304347826086,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 661.5925,
            "dailyChangePct": 1.4718492948040618,
            "cumulativeChangePct": -1.9543842640337927,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 602.3269,
            "dailyChangePct": 2.5573315511891126,
            "cumulativeChangePct": -3.8008390977582907,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2025-11-20",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2025-11-20",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-21",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-25",
        "VIX": 18.56,
        "VIX3M": 20.73,
        "ratio": 0.8953207911239749,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 667.8154,
            "dailyChangePct": 0.9405940968194137,
            "cumulativeChangePct": -1.0321729902310506,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 606.0394,
            "dailyChangePct": 0.6163596545331052,
            "cumulativeChangePct": -3.2079062819574844,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2025-11-21",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-26",
        "VIX": 17.19,
        "VIX3M": 20.02,
        "ratio": 0.8586413586413587,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 672.4257,
            "dailyChangePct": 0.6903554485266472,
            "cumulativeChangePct": -0.34894320418068503,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 611.3942,
            "dailyChangePct": 0.8835729162163242,
            "cumulativeChangePct": -2.3526775568261327,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-11-28",
        "VIX": 16.35,
        "VIX3M": 19.64,
        "ratio": 0.8324847250509165,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.0961,
            "dailyChangePct": 0.545844693324482,
            "cumulativeChangePct": 0.19499680118106877,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 616.3509,
            "dailyChangePct": 0.810720808277221,
            "cumulativeChangePct": -1.561030395053764,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2025-12",
    "monthLabel": "2025年12月",
    "status": "complete",
    "asOfDate": "2025-12-31",
    "expectedSessions": 22,
    "observedSessions": 22,
    "priorSession": {
      "date": "2025-11-28",
      "VIX": 16.35,
      "VIX3M": 19.64,
      "ratio": 0.8324847250509165,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 0.07979634847767869,
        "baselineClose": 676.0961,
        "baselineDate": "2025-11-28"
      },
      "QQQ": {
        "monthlyChangePct": -0.6699105980051301,
        "baselineClose": 616.3509,
        "baselineDate": "2025-11-28"
      },
      "vixMax": {
        "value": 17.62,
        "date": "2025-12-17"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2025-12-01",
        "VIX": 17.24,
        "VIX3M": 20.22,
        "ratio": 0.8526211671612265,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 673.0094,
            "dailyChangePct": -0.45654752334763904,
            "cumulativeChangePct": -0.45654752334763904,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 614.2807,
            "dailyChangePct": -0.3358800968733866,
            "cumulativeChangePct": -0.3358800968733866,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-02",
        "VIX": 16.59,
        "VIX3M": 19.84,
        "ratio": 0.8361895161290323,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 674.2559,
            "dailyChangePct": 0.18521286626902445,
            "cumulativeChangePct": -0.272180241832487,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 619.088,
            "dailyChangePct": 0.7825901090494858,
            "cumulativeChangePct": 0.44408144775969216,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-03",
        "VIX": 16.08,
        "VIX3M": 19.71,
        "ratio": 0.8158295281582951,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.5907,
            "dailyChangePct": 0.34627802292868104,
            "cumulativeChangePct": 0.07315528073597033,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 620.6009,
            "dailyChangePct": 0.2443755976533346,
            "cumulativeChangePct": 0.6895422721050704,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-04",
        "VIX": 15.78,
        "VIX3M": 19.49,
        "ratio": 0.8096459722934839,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 677.0854,
            "dailyChangePct": 0.07311658289126388,
            "cumulativeChangePct": 0.146325352268728,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 620.0236,
            "dailyChangePct": -0.0930227461803601,
            "cumulativeChangePct": 0.5958780947671105,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-05",
        "VIX": 15.41,
        "VIX3M": 19.27,
        "ratio": 0.7996886351842242,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 678.3715,
            "dailyChangePct": 0.18994649714791922,
            "cumulativeChangePct": 0.3365497892977132,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 622.5517,
            "dailyChangePct": 0.4077425439934945,
            "cumulativeChangePct": 1.0060502872633048,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-08",
        "VIX": 16.66,
        "VIX3M": 19.91,
        "ratio": 0.8367654445002511,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.3335,
            "dailyChangePct": -0.3004253569025228,
            "cumulativeChangePct": 0.035113351489535205,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 621.3574,
            "dailyChangePct": -0.1918394889934394,
            "cumulativeChangePct": 0.812280796539766,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-09",
        "VIX": 16.93,
        "VIX3M": 20.08,
        "ratio": 0.8431274900398407,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 675.7498,
            "dailyChangePct": -0.08630357656391752,
            "cumulativeChangePct": -0.05122052915257358,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 622.1238,
            "dailyChangePct": 0.12334286193420585,
            "cumulativeChangePct": 0.9366255488553632,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-10",
        "VIX": 15.77,
        "VIX3M": 19.35,
        "ratio": 0.8149870801033591,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.2314,
            "dailyChangePct": 0.6632040438635745,
            "cumulativeChangePct": 0.6116438180903572,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 624.6718,
            "dailyChangePct": 0.409564784372507,
            "cumulativeChangePct": 1.3500264216373958,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-11",
        "VIX": 14.85,
        "VIX3M": 19.05,
        "ratio": 0.7795275590551181,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 681.8144,
            "dailyChangePct": 0.23271492612659817,
            "cumulativeChangePct": 0.8457821306763869,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 622.6513,
            "dailyChangePct": -0.3234498499852245,
            "cumulativeChangePct": 1.022209913216643,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-12",
        "VIX": 15.74,
        "VIX3M": 19.25,
        "ratio": 0.8176623376623376,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 674.4835,
            "dailyChangePct": -1.0752046304683405,
            "cumulativeChangePct": -0.23851638842464773,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 610.7473,
            "dailyChangePct": -1.9118244834628983,
            "cumulativeChangePct": -0.9091574296395177,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-15",
        "VIX": 16.5,
        "VIX3M": 19.68,
        "ratio": 0.8384146341463414,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 673.4645,
            "dailyChangePct": -0.15107856604349434,
            "cumulativeChangePct": -0.3892346073287367,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 607.6817,
            "dailyChangePct": -0.5019424563972752,
            "cumulativeChangePct": -1.4065364389019397,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-16",
        "VIX": 16.48,
        "VIX3M": 19.67,
        "ratio": 0.8378240976105744,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 671.6243,
            "dailyChangePct": -0.2732438012694183,
            "cumulativeChangePct": -0.6614148491612459,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 608.886,
            "dailyChangePct": 0.19817940872663975,
            "cumulativeChangePct": -1.2111444957734419,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-17",
        "VIX": 17.62,
        "VIX3M": 20.08,
        "ratio": 0.8774900398406376,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 664.234,
            "dailyChangePct": -1.1003622114327816,
            "cumulativeChangePct": -1.754499101533047,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 597.5991,
            "dailyChangePct": -1.853696751115963,
            "cumulativeChangePct": -3.0423903007199327,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-18",
        "VIX": 16.87,
        "VIX3M": 19.59,
        "ratio": 0.8611536498213375,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 669.2499,
            "dailyChangePct": 0.7551405077126372,
            "cumulativeChangePct": -1.0126075272435364,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-11-20"
          },
          "QQQ": {
            "adjustedClose": 606.2584,
            "dailyChangePct": 1.4490148997881702,
            "cumulativeChangePct": -1.6374600896988944,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-11-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-19",
        "VIX": 14.91,
        "VIX3M": 18.25,
        "ratio": 0.816986301369863,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 675.3159,
            "dailyChangePct": 0.9063878829119076,
            "cumulativeChangePct": -0.11539779626001945,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-11-21"
          },
          "QQQ": {
            "adjustedClose": 614.1612,
            "dailyChangePct": 1.3035365778024666,
            "cumulativeChangePct": -0.35526840311258523,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-11-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-22",
        "VIX": 14.08,
        "VIX3M": 17.79,
        "ratio": 0.7914558740865655,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 679.5231,
            "dailyChangePct": 0.62299732614024,
            "cumulativeChangePct": 0.5068806046951035,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2025-11-24"
          },
          "QQQ": {
            "adjustedClose": 617.1053,
            "dailyChangePct": 0.4793692600574717,
            "cumulativeChangePct": 0.12239780942966405,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-23",
        "VIX": 14,
        "VIX3M": 17.84,
        "ratio": 0.7847533632286996,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 682.6288,
            "dailyChangePct": 0.4570411219280146,
            "cumulativeChangePct": 0.9662383794256435,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 619.9954,
            "dailyChangePct": 0.4683317417627064,
            "cumulativeChangePct": 0.5913027789851588,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-24",
        "VIX": 13.47,
        "VIX3M": 17.77,
        "ratio": 0.7580191333708498,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 685.03,
            "dailyChangePct": 0.35175779281506614,
            "cumulativeChangePct": 1.3213949910375167,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 621.8092,
            "dailyChangePct": 0.2925505576331755,
            "cumulativeChangePct": 0.8855831961955385,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-26",
        "VIX": 13.6,
        "VIX3M": 17.77,
        "ratio": 0.7653348339898706,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 684.9606,
            "dailyChangePct": -0.01013094317037222,
            "cumulativeChangePct": 1.3111301780915463,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 621.7693,
            "dailyChangePct": -0.006416759353189416,
            "cumulativeChangePct": 0.879109611099782,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-29",
        "VIX": 14.2,
        "VIX3M": 17.82,
        "ratio": 0.7968574635241301,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 682.5197,
            "dailyChangePct": -0.3563562634113615,
            "cumulativeChangePct": 0.950101620169086,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 618.7596,
            "dailyChangePct": -0.48405413390465446,
            "cumulativeChangePct": 0.39080011078105326,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-30",
        "VIX": 14.33,
        "VIX3M": 17.77,
        "ratio": 0.8064153066966798,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 681.6862,
            "dailyChangePct": -0.12212101716624346,
            "cumulativeChangePct": 0.8268203292401743,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 617.3245,
            "dailyChangePct": -0.23193175507904007,
            "cumulativeChangePct": 0.15796196614621394,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2025-12-31",
        "VIX": 14.95,
        "VIX3M": 18.18,
        "ratio": 0.8223322332233223,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.6356,
            "dailyChangePct": -0.7408980847786073,
            "cumulativeChangePct": 0.07979634847767869,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 612.2219,
            "dailyChangePct": -0.8265669028201472,
            "cumulativeChangePct": -0.6699105980051301,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-01",
    "monthLabel": "2026年1月",
    "status": "complete",
    "asOfDate": "2026-01-30",
    "expectedSessions": 20,
    "observedSessions": 20,
    "priorSession": {
      "date": "2025-12-31",
      "VIX": 14.95,
      "VIX3M": 18.18,
      "ratio": 0.8223322332233223,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 1.4737770226692204,
        "baselineClose": 676.6356,
        "baselineDate": "2025-12-31"
      },
      "QQQ": {
        "monthlyChangePct": 1.2306485605954265,
        "baselineClose": 612.2219,
        "baselineDate": "2025-12-31"
      },
      "vixMax": {
        "value": 20.09,
        "date": "2026-01-20"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-01-02",
        "VIX": 14.51,
        "VIX3M": 18.02,
        "ratio": 0.8052164261931187,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 677.8759,
            "dailyChangePct": 0.18330398223209698,
            "cumulativeChangePct": 0.18330398223209698,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 611.036,
            "dailyChangePct": -0.1937042761783081,
            "cumulativeChangePct": -0.1937042761783081,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-05",
        "VIX": 14.9,
        "VIX3M": 18.32,
        "ratio": 0.8133187772925764,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 682.3907,
            "dailyChangePct": 0.6660216125105034,
            "cumulativeChangePct": 0.8505464388808504,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 615.8894,
            "dailyChangePct": 0.7942903527779155,
            "cumulativeChangePct": 0.5990475022210173,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-06",
        "VIX": 14.75,
        "VIX3M": 18.15,
        "ratio": 0.81267217630854,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.449,
            "dailyChangePct": 0.5947179526332835,
            "cumulativeChangePct": 1.450322743881638,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 621.3009,
            "dailyChangePct": 0.8786480169978406,
            "cumulativeChangePct": 1.4829590382180013,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-07",
        "VIX": 15.38,
        "VIX3M": 18.59,
        "ratio": 0.827326519634212,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 684.2362,
            "dailyChangePct": -0.3223546104663133,
            "cumulativeChangePct": 1.1232929511837852,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 621.8989,
            "dailyChangePct": 0.09624965938406227,
            "cumulativeChangePct": 1.5806360406251496,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-08",
        "VIX": 15.45,
        "VIX3M": 18.39,
        "ratio": 0.8401305057096248,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 684.1668,
            "dailyChangePct": -0.010142696337911428,
            "cumulativeChangePct": 1.1130363226528495,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 618.361,
            "dailyChangePct": -0.5688866791692448,
            "cumulativeChangePct": 1.0027573335746442,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-09",
        "VIX": 14.49,
        "VIX3M": 17.88,
        "ratio": 0.8104026845637584,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 688.6915,
            "dailyChangePct": 0.6613445726977751,
            "cumulativeChangePct": 1.7817419006626478,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 624.52,
            "dailyChangePct": 0.996020124166952,
            "cumulativeChangePct": 2.008765122580547,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-12",
        "VIX": 15.12,
        "VIX3M": 18.23,
        "ratio": 0.8294020844761382,
        "currentRiskDuration": 15,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 689.773,
            "dailyChangePct": 0.15703693163049426,
            "cumulativeChangePct": 1.941576825103497,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 625.0382,
            "dailyChangePct": 0.08297572535707065,
            "cumulativeChangePct": 2.0934076353688047,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-13",
        "VIX": 15.98,
        "VIX3M": 18.85,
        "ratio": 0.8477453580901856,
        "currentRiskDuration": 16,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 688.3938,
            "dailyChangePct": -0.1999498385700793,
            "cumulativeChangePct": 1.7377448068059298,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 624.1114,
            "dailyChangePct": -0.14827893719134844,
            "cumulativeChangePct": 1.9420246155846366,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-14",
        "VIX": 16.75,
        "VIX3M": 19.37,
        "ratio": 0.8647392875580795,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 685.0102,
            "dailyChangePct": -0.49152098696996216,
            "cumulativeChangePct": 1.2376824394105368,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 617.4441,
            "dailyChangePct": -1.068286847508304,
            "cumulativeChangePct": 0.8529913745326745,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-15",
        "VIX": 15.84,
        "VIX3M": 18.9,
        "ratio": 0.8380952380952381,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.8756,
            "dailyChangePct": 0.27231711294224414,
            "cumulativeChangePct": 1.5133699734391826,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-12-17"
          },
          "QQQ": {
            "adjustedClose": 619.6665,
            "dailyChangePct": 0.35993541763537085,
            "cumulativeChangePct": 1.2159970102343598,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-12-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-16",
        "VIX": 15.86,
        "VIX3M": 18.99,
        "ratio": 0.8351764086361243,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.3001,
            "dailyChangePct": -0.08378518613849639,
            "cumulativeChangePct": 1.4283168074514796,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-12-18"
          },
          "QQQ": {
            "adjustedClose": 619.1483,
            "dailyChangePct": -0.08362562765618087,
            "cumulativeChangePct": 1.131354497446102,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2025-12-18"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-20",
        "VIX": 20.09,
        "VIX3M": 21.28,
        "ratio": 0.944078947368421,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 672.3292,
            "dailyChangePct": -2.035683806544697,
            "cumulativeChangePct": -0.6364430130486709,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 605.9932,
            "dailyChangePct": -2.124709055972529,
            "cumulativeChangePct": -1.017392549988816,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-21",
        "VIX": 16.9,
        "VIX3M": 19.36,
        "ratio": 0.8729338842975206,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.0886,
            "dailyChangePct": 1.1541072438918443,
            "cumulativeChangePct": 0.5103189959263288,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 614.1852,
            "dailyChangePct": 1.3518303505715812,
            "cumulativeChangePct": 0.32068437930756755,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-22",
        "VIX": 15.64,
        "VIX3M": 18.75,
        "ratio": 0.8341333333333334,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 683.6409,
            "dailyChangePct": 0.5223290024270355,
            "cumulativeChangePct": 1.0353135424739701,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 618.65,
            "dailyChangePct": 0.7269468557692393,
            "cumulativeChangePct": 1.049962440089125,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-23",
        "VIX": 16.09,
        "VIX3M": 19.15,
        "ratio": 0.8402088772845954,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 683.889,
            "dailyChangePct": 0.03629098259041452,
            "cumulativeChangePct": 1.0719802505218645,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 620.6033,
            "dailyChangePct": 0.31573587650528534,
            "cumulativeChangePct": 1.3690134247076102,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-26",
        "VIX": 16.15,
        "VIX3M": 19.07,
        "ratio": 0.846879916098584,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 687.3618,
            "dailyChangePct": 0.5078017046626027,
            "cumulativeChangePct": 1.585225489170261,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 623.334,
            "dailyChangePct": 0.44000732835289824,
            "cumulativeChangePct": 1.815044512455355,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-27",
        "VIX": 16.35,
        "VIX3M": 19.22,
        "ratio": 0.8506763787721126,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 690.1004,
            "dailyChangePct": 0.39842190822940715,
            "cumulativeChangePct": 1.98996328304335,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 628.9847,
            "dailyChangePct": 0.9065284422155706,
            "cumulativeChangePct": 2.7380268494152205,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-28",
        "VIX": 16.35,
        "VIX3M": 19.3,
        "ratio": 0.8471502590673575,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 690.031,
            "dailyChangePct": -0.010056507719757857,
            "cumulativeChangePct": 1.9797066545124142,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 631.0676,
            "dailyChangePct": 0.3311527291522287,
            "cumulativeChangePct": 3.0782466292042177,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-29",
        "VIX": 16.88,
        "VIX3M": 19.67,
        "ratio": 0.8581596339603456,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 688.6617,
            "dailyChangePct": -0.19844035992585551,
            "cumulativeChangePct": 1.7773377575758698,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 627.2905,
            "dailyChangePct": -0.5985254194637801,
            "cumulativeChangePct": 2.461297121190853,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-01-30",
        "VIX": 17.44,
        "VIX3M": 20.07,
        "ratio": 0.8689586447433981,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.6077,
            "dailyChangePct": -0.29825965346991223,
            "cumulativeChangePct": 1.4737770226692204,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 619.7562,
            "dailyChangePct": -1.2010862590777216,
            "cumulativeChangePct": 1.2306485605954265,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-02",
    "monthLabel": "2026年2月",
    "status": "complete",
    "asOfDate": "2026-02-27",
    "expectedSessions": 19,
    "observedSessions": 19,
    "priorSession": {
      "date": "2026-01-30",
      "VIX": 17.44,
      "VIX3M": 20.07,
      "ratio": 0.8689586447433981,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -0.8641907161833551,
        "baselineClose": 686.6077,
        "baselineDate": "2026-01-30"
      },
      "QQQ": {
        "monthlyChangePct": -2.3445348348269834,
        "baselineClose": 619.7562,
        "baselineDate": "2026-01-30"
      },
      "vixMax": {
        "value": 21.77,
        "date": "2026-02-05"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-02-02",
        "VIX": 16.34,
        "VIX3M": 19.37,
        "ratio": 0.8435725348477026,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 690.0211,
            "dailyChangePct": 0.4971397786538212,
            "cumulativeChangePct": 0.4971397786538212,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 624.0117,
            "dailyChangePct": 0.6866409726921541,
            "cumulativeChangePct": 0.6866409726921541,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-03",
        "VIX": 18,
        "VIX3M": 20.35,
        "ratio": 0.8845208845208845,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 684.1866,
            "dailyChangePct": -0.845553853353187,
            "cumulativeChangePct": -0.3526176592543395,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 614.4244,
            "dailyChangePct": -1.5363974745986386,
            "cumulativeChangePct": -0.8603060364704818,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-01-20"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-04",
        "VIX": 18.64,
        "VIX3M": 20.62,
        "ratio": 0.903976721629486,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.8725,
            "dailyChangePct": -0.48438540012331055,
            "cumulativeChangePct": -0.8352950309179596,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 603.691,
            "dailyChangePct": -1.7469032805337736,
            "cumulativeChangePct": -2.5921806026305227,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-02-04"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-05",
        "VIX": 21.77,
        "VIX3M": 22.45,
        "ratio": 0.9697104677060133,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 672.3689,
            "dailyChangePct": -1.2489269283162296,
            "cumulativeChangePct": -2.073789734662157,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 595.0006,
            "dailyChangePct": -1.4395444026828352,
            "cumulativeChangePct": -3.994409414540756,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-06",
        "VIX": 17.76,
        "VIX3M": 20.37,
        "ratio": 0.8718703976435935,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 685.2682,
            "dailyChangePct": 1.9184855218615793,
            "cumulativeChangePct": -0.19508956861393756,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 607.5777,
            "dailyChangePct": 2.1137961877685685,
            "cumulativeChangePct": -1.9650469007006288,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-09",
        "VIX": 17.36,
        "VIX3M": 20.09,
        "ratio": 0.8641114982578397,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 688.5724,
            "dailyChangePct": 0.4821761756929721,
            "cumulativeChangePct": 0.2861459316579218,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 612.2319,
            "dailyChangePct": 0.7660254811853617,
            "cumulativeChangePct": -1.2140741794918752,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-10",
        "VIX": 17.79,
        "VIX3M": 20.43,
        "ratio": 0.8707782672540382,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.7566,
            "dailyChangePct": -0.2637050221588888,
            "cumulativeChangePct": 0.021686328306547153,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 609.3916,
            "dailyChangePct": -0.46392551580536345,
            "cumulativeChangePct": -1.6723672953977697,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-11",
        "VIX": 17.65,
        "VIX3M": 20.37,
        "ratio": 0.8664702994599901,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 686.5978,
            "dailyChangePct": -0.023123185128481882,
            "cumulativeChangePct": -0.0014418713917718762,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 611.026,
            "dailyChangePct": 0.2682019246737166,
            "cumulativeChangePct": -1.4086506919979258,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-12",
        "VIX": 20.82,
        "VIX3M": 22.17,
        "ratio": 0.9391069012178619,
        "currentRiskDuration": 15,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 675.9906,
            "dailyChangePct": -1.5448928033267806,
            "cumulativeChangePct": -1.5463123993511907,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 598.5984,
            "dailyChangePct": -2.033890538209504,
            "cumulativeChangePct": -3.4138908170664672,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-13",
        "VIX": 20.6,
        "VIX3M": 22.17,
        "ratio": 0.9291835814163284,
        "currentRiskDuration": 16,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.4669,
            "dailyChangePct": 0.07045955964477546,
            "cumulativeChangePct": -1.4769423646137425,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 599.874,
            "dailyChangePct": 0.21309779645253268,
            "cumulativeChangePct": -3.208067946718407,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-17",
        "VIX": 20.29,
        "VIX3M": 21.6,
        "ratio": 0.9393518518518518,
        "currentRiskDuration": 17,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 677.5584,
            "dailyChangePct": 0.16135305363795815,
            "cumulativeChangePct": -1.3179724025815687,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-01-20"
          },
          "QQQ": {
            "adjustedClose": 599.2561,
            "dailyChangePct": -0.10300496437586348,
            "cumulativeChangePct": -3.307768441848602,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-18",
        "VIX": 19.62,
        "VIX3M": 21.39,
        "ratio": 0.9172510518934082,
        "currentRiskDuration": 18,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.9717,
            "dailyChangePct": 0.5037646939363594,
            "cumulativeChangePct": -0.8208471882852453,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 603.7309,
            "dailyChangePct": 0.7467258155569922,
            "cumulativeChangePct": -2.585742587165729,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-19",
        "VIX": 20.23,
        "VIX3M": 21.88,
        "ratio": 0.9245886654478976,
        "currentRiskDuration": 19,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 679.1758,
            "dailyChangePct": -0.26372608435858425,
            "cumulativeChangePct": -1.0824084844955895,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 601.4188,
            "dailyChangePct": -0.3829686371858654,
            "cumulativeChangePct": -2.9588086412043912,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-20",
        "VIX": 19.09,
        "VIX3M": 21.09,
        "ratio": 0.9051683262209578,
        "currentRiskDuration": 20,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 684.0874,
            "dailyChangePct": 0.7231706430058438,
            "cumulativeChangePct": -0.3670655018870317,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 606.7406,
            "dailyChangePct": 0.8848742340611837,
            "cumulativeChangePct": -2.100116142444408,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-23",
        "VIX": 21.01,
        "VIX3M": 22.14,
        "ratio": 0.9489611562782295,
        "currentRiskDuration": 21,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 677.102,
            "dailyChangePct": -1.0211268326240197,
            "cumulativeChangePct": -1.3844441301779864,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 599.3658,
            "dailyChangePct": -1.2154782455632507,
            "cumulativeChangePct": -3.2900679331646865,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-24",
        "VIX": 19.55,
        "VIX3M": 21.34,
        "ratio": 0.9161199625117151,
        "currentRiskDuration": 22,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 682.0235,
            "dailyChangePct": 0.7268476536770097,
            "cumulativeChangePct": -0.6676592761776456,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 605.8038,
            "dailyChangePct": 1.0741353610766557,
            "cumulativeChangePct": -2.251272355161593,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-25",
        "VIX": 17.93,
        "VIX3M": 20.36,
        "ratio": 0.880648330058939,
        "currentRiskDuration": 23,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 687.7786,
            "dailyChangePct": 0.8438272288271653,
            "cumulativeChangePct": 0.17053406188132225,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 614.5839,
            "dailyChangePct": 1.4493306248656745,
            "cumulativeChangePct": -0.8345701099884195,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-26",
        "VIX": 18.63,
        "VIX3M": 20.81,
        "ratio": 0.8952426717924075,
        "currentRiskDuration": 24,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 683.9584,
            "dailyChangePct": -0.5554403699097321,
            "cumulativeChangePct": -0.3858535230525484,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 607.1691,
            "dailyChangePct": -1.2064748197927133,
            "cumulativeChangePct": -2.0309760515506037,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-02-27",
        "VIX": 19.86,
        "VIX3M": 21.56,
        "ratio": 0.9211502782931354,
        "currentRiskDuration": 25,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 680.6741,
            "dailyChangePct": -0.48019002325287996,
            "cumulativeChangePct": -0.8641907161833551,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 605.2258,
            "dailyChangePct": -0.32005910709222984,
            "cumulativeChangePct": -2.3445348348269834,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-03",
    "monthLabel": "2026年3月",
    "status": "complete",
    "asOfDate": "2026-03-31",
    "expectedSessions": 22,
    "observedSessions": 22,
    "priorSession": {
      "date": "2026-02-27",
      "VIX": 19.86,
      "VIX3M": 21.56,
      "ratio": 0.9211502782931354,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -4.93797251871343,
        "baselineClose": 680.6741,
        "baselineDate": "2026-02-27"
      },
      "QQQ": {
        "monthlyChangePct": -4.838293410492412,
        "baselineClose": 605.2258,
        "baselineDate": "2026-02-27"
      },
      "vixMax": {
        "value": 31.05,
        "date": "2026-03-27"
      },
      "highStressDays": 8,
      "inversionDays": 9
    },
    "rows": [
      {
        "date": "2026-03-02",
        "VIX": 21.44,
        "VIX3M": 22.44,
        "ratio": 0.9554367201426025,
        "currentRiskDuration": 26,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 681.061,
            "dailyChangePct": 0.05684071128901902,
            "cumulativeChangePct": 0.05684071128901902,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 606.0231,
            "dailyChangePct": 0.13173595705933128,
            "cumulativeChangePct": 0.13173595705933128,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-03",
        "VIX": 23.57,
        "VIX3M": 23.54,
        "ratio": 1.0012744265080715,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 675.0579,
            "dailyChangePct": -0.8814335279806129,
            "cumulativeChangePct": -0.8250938297784449,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 599.5352,
            "dailyChangePct": -1.070569752209105,
            "cumulativeChangePct": -0.9402441204588441,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-03",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-04",
        "VIX": 21.15,
        "VIX3M": 22.29,
        "ratio": 0.9488559892328398,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 679.8207,
            "dailyChangePct": 0.7055394803912263,
            "cumulativeChangePct": -0.12537571210656795,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 608.674,
            "dailyChangePct": 1.5243141687093509,
            "cumulativeChangePct": 0.5697377739019016,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-03",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-04",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-05",
        "VIX": 23.75,
        "VIX3M": 23.86,
        "ratio": 0.9953897736797989,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.0303,
            "dailyChangePct": -0.5575587798370973,
            "cumulativeChangePct": -0.6822354486530235,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-02-05"
          },
          "QQQ": {
            "adjustedClose": 606.8403,
            "dailyChangePct": -0.30126143058517574,
            "cumulativeChangePct": 0.26675994314846463,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-02-05"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-03",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-04",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-06",
        "VIX": 29.49,
        "VIX3M": 27.56,
        "ratio": 1.0700290275761974,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 667.1695,
            "dailyChangePct": -1.3107104814680692,
            "cumulativeChangePct": -1.9840037985873082,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-06"
          },
          "QQQ": {
            "adjustedClose": 597.7114,
            "dailyChangePct": -1.5043331828818785,
            "cumulativeChangePct": -1.2415861980768161,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-06"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-04",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-06",
            "sessionsAgo": 0
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-06",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-09",
        "VIX": 25.5,
        "VIX3M": 25.34,
        "ratio": 1.0063141278610892,
        "currentRiskDuration": 2,
        "inversionDays": 2,
        "highStressDays": 2,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 673.0139,
            "dailyChangePct": 0.8759992775449144,
            "cumulativeChangePct": -1.1253843799844732,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-06"
          },
          "QQQ": {
            "adjustedClose": 605.6942,
            "dailyChangePct": 1.3355609412837088,
            "cumulativeChangePct": 0.07739260289298944,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-06"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-06",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-06",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-10",
        "VIX": 24.93,
        "VIX3M": 25.51,
        "ratio": 0.9772638181105449,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 671.9323,
            "dailyChangePct": -0.16070990510002048,
            "cumulativeChangePct": -1.2842856809154202,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-06"
          },
          "QQQ": {
            "adjustedClose": 605.7041,
            "dailyChangePct": 0.001634488162505221,
            "cumulativeChangePct": 0.07902835602844327,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-06"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-06",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-06",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-10",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-11",
        "VIX": 24.23,
        "VIX3M": 24.97,
        "ratio": 0.9703644373247898,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 671.0889,
            "dailyChangePct": -0.1255185976325457,
            "cumulativeChangePct": -1.4081922611716813,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-06"
          },
          "QQQ": {
            "adjustedClose": 605.6244,
            "dailyChangePct": -0.013158240137389754,
            "cumulativeChangePct": 0.06585971715018513,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-06"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-10",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-12",
        "VIX": 27.29,
        "VIX3M": 26.95,
        "ratio": 1.0126159554730982,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 660.8985,
            "dailyChangePct": -1.5184873419900047,
            "cumulativeChangePct": -2.9052963819249045,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-12"
          },
          "QQQ": {
            "adjustedClose": 595.2299,
            "dailyChangePct": -1.7163278097778067,
            "cumulativeChangePct": -1.6515984612685108,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-12"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-10",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-12",
            "sessionsAgo": 0
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-12",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-13",
        "VIX": 27.19,
        "VIX3M": 27.28,
        "ratio": 0.9967008797653959,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 657.1577,
            "dailyChangePct": -0.5660173233862698,
            "cumulativeChangePct": -3.454869224493773,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-13"
          },
          "QQQ": {
            "adjustedClose": 591.7019,
            "dailyChangePct": -0.5927121604610286,
            "cumulativeChangePct": -2.2345213968076094,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-12",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-12",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-13",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-16",
        "VIX": 23.51,
        "VIX3M": 24.92,
        "ratio": 0.9434189406099518,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 663.8455,
            "dailyChangePct": 1.0176857092293101,
            "cumulativeChangePct": -2.472343225634699,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-13"
          },
          "QQQ": {
            "adjustedClose": 598.3393,
            "dailyChangePct": 1.1217472852461663,
            "cumulativeChangePct": -1.1378397946683827,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-12",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-12",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-13",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-17",
        "VIX": 22.37,
        "VIX3M": 24.33,
        "ratio": 0.9194410193177148,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 665.5919,
            "dailyChangePct": 0.26307326026915323,
            "cumulativeChangePct": -2.2157740392942715,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-13"
          },
          "QQQ": {
            "adjustedClose": 601.2593,
            "dailyChangePct": 0.48801741754220807,
            "cumulativeChangePct": -0.6553752335078933,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-13",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-18",
        "VIX": 25.09,
        "VIX3M": 26.56,
        "ratio": 0.9446536144578314,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 656.3044,
            "dailyChangePct": -1.3953745530857598,
            "cumulativeChangePct": -3.5802302452818457,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-18"
          },
          "QQQ": {
            "adjustedClose": 592.8779,
            "dailyChangePct": -1.3939742803146804,
            "cumulativeChangePct": -2.0402137516279173,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-13"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-18",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-19",
        "VIX": 24.06,
        "VIX3M": 25.54,
        "ratio": 0.942051683633516,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 654.687,
            "dailyChangePct": -0.24644052363506086,
            "cumulativeChangePct": -3.8178476307530906,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-19"
          },
          "QQQ": {
            "adjustedClose": 591.0043,
            "dailyChangePct": -0.31601785123041015,
            "cumulativeChangePct": -2.3497841631999306,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-19"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-18",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-20",
        "VIX": 26.78,
        "VIX3M": 27.43,
        "ratio": 0.9763033175355451,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 645.3016,
            "dailyChangePct": -1.4335705459250003,
            "cumulativeChangePct": -5.196686637555326,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-20"
          },
          "QQQ": {
            "adjustedClose": 580.0815,
            "dailyChangePct": -1.848176062339979,
            "cumulativeChangePct": -4.154532077118988,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-20"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-18",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-20",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-23",
        "VIX": 26.15,
        "VIX3M": 26.1,
        "ratio": 1.0019157088122603,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 652.0772,
            "dailyChangePct": 1.0499896482512927,
            "cumulativeChangePct": -4.201261661050426,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-20"
          },
          "QQQ": {
            "adjustedClose": 586.7401,
            "dailyChangePct": 1.1478731867849534,
            "cumulativeChangePct": -3.0543476500836664,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-20"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-20",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-23",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-24",
        "VIX": 26.95,
        "VIX3M": 26.56,
        "ratio": 1.014683734939759,
        "currentRiskDuration": 2,
        "inversionDays": 2,
        "highStressDays": 2,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 649.8883,
            "dailyChangePct": -0.3356811126044579,
            "cumulativeChangePct": -4.522839931767642,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-20"
          },
          "QQQ": {
            "adjustedClose": 582.7287,
            "dailyChangePct": -0.6836757876272581,
            "cumulativeChangePct": -3.7171416023573434,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-20"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-03-20",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-23",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-25",
        "VIX": 25.33,
        "VIX3M": 25.63,
        "ratio": 0.9882949668357394,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 653.51,
            "dailyChangePct": 0.5572803818748584,
            "cumulativeChangePct": -3.9907644495361216,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-20"
          },
          "QQQ": {
            "adjustedClose": 586.5604,
            "dailyChangePct": 0.6575444113186668,
            "cumulativeChangePct": -3.0840390479057733,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-20"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-23",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-25",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-26",
        "VIX": 27.44,
        "VIX3M": 27.16,
        "ratio": 1.0103092783505154,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 641.8391,
            "dailyChangePct": -1.7858793285489116,
            "cumulativeChangePct": -5.705373540729686,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-26"
          },
          "QQQ": {
            "adjustedClose": 572.5605,
            "dailyChangePct": -2.3867789233640635,
            "cumulativeChangePct": -5.3972087772860995,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-26"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-25",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-26",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-27",
        "VIX": 31.05,
        "VIX3M": 29.27,
        "ratio": 1.0608131192347114,
        "currentRiskDuration": 1,
        "inversionDays": 2,
        "highStressDays": 2,
        "extremeStressDays": 1,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 630.8945,
            "dailyChangePct": -1.705193715995179,
            "cumulativeChangePct": -7.313279585634291,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-27"
          },
          "QQQ": {
            "adjustedClose": 561.3745,
            "dailyChangePct": -1.9536800041218383,
            "cumulativeChangePct": -7.245444592745387,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-27"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-25",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-26",
            "sessionsAgo": 1
          },
          {
            "type": "VIX_CROSS_30",
            "date": "2026-03-27",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-30",
        "VIX": 30.61,
        "VIX3M": 29.13,
        "ratio": 1.0508067284586338,
        "currentRiskDuration": 2,
        "inversionDays": 3,
        "highStressDays": 3,
        "extremeStressDays": 2,
        "currentRiskLevel": "EXTREME_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 628.7852,
            "dailyChangePct": -0.3343348214321029,
            "cumulativeChangePct": -7.6231635668229325,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 557.0837,
            "dailyChangePct": -0.7643382447902414,
            "cumulativeChangePct": -7.954403133508192,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-03-26",
            "sessionsAgo": 2
          },
          {
            "type": "VIX_CROSS_30",
            "date": "2026-03-27",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-03-31",
        "VIX": 25.25,
        "VIX3M": 25.55,
        "ratio": 0.9882583170254403,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "HIGH_HOLD",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 647.0626,
            "dailyChangePct": 2.9067796124972345,
            "cumulativeChangePct": -4.93797251871343,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 575.9432,
            "dailyChangePct": 3.385397921353661,
            "cumulativeChangePct": -4.838293410492412,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_30",
            "date": "2026-03-27",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-31",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-04",
    "monthLabel": "2026年4月",
    "status": "complete",
    "asOfDate": "2026-04-30",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2026-03-31",
      "VIX": 25.25,
      "VIX3M": 25.55,
      "ratio": 0.9882583170254403,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 10.505274141945463,
        "baselineClose": 647.0626,
        "baselineDate": "2026-03-31"
      },
      "QQQ": {
        "monthlyChangePct": 15.690088883764929,
        "baselineClose": 575.9432,
        "baselineDate": "2026-03-31"
      },
      "vixMax": {
        "value": 25.78,
        "date": "2026-04-07"
      },
      "highStressDays": 1,
      "inversionDays": 1
    },
    "rows": [
      {
        "date": "2026-04-01",
        "VIX": 24.54,
        "VIX3M": 24.86,
        "ratio": 0.9871279163314561,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 651.9379,
            "dailyChangePct": 0.7534510571311159,
            "cumulativeChangePct": 0.7534510571311159,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 583.058,
            "dailyChangePct": 1.2353301506120573,
            "cumulativeChangePct": 1.2353301506120573,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-31",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-02",
        "VIX": 23.87,
        "VIX3M": 24.72,
        "ratio": 0.9656148867313916,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 652.525,
            "dailyChangePct": 0.09005458955522183,
            "cumulativeChangePct": 0.8441841639433401,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 583.7265,
            "dailyChangePct": 0.11465411674309589,
            "cumulativeChangePct": 1.351400624228205,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-03-31",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-06",
        "VIX": 24.17,
        "VIX3M": 24.77,
        "ratio": 0.9757771497779573,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 655.6094,
            "dailyChangePct": 0.472686870234873,
            "cumulativeChangePct": 1.320861381881766,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 587.239,
            "dailyChangePct": 0.6017372862119563,
            "cumulativeChangePct": 1.9612697918822475,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-07",
        "VIX": 25.78,
        "VIX3M": 25.57,
        "ratio": 1.0082127493156043,
        "currentRiskDuration": 1,
        "inversionDays": 1,
        "highStressDays": 1,
        "extremeStressDays": 0,
        "currentRiskLevel": "HIGH_STRESS",
        "termStructure": "INVERTED",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 655.8979,
            "dailyChangePct": 0.04400486021096661,
            "cumulativeChangePct": 1.3654474852974108,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 587.3288,
            "dailyChangePct": 0.015291899890845784,
            "cumulativeChangePct": 1.9768616071862644,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-04-07",
            "sessionsAgo": 0
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-04-07",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-08",
        "VIX": 21.04,
        "VIX3M": 22.68,
        "ratio": 0.927689594356261,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 672.6033,
            "dailyChangePct": 2.546951286168153,
            "cumulativeChangePct": 3.9471760537542977,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 604.7913,
            "dailyChangePct": 2.973206830654318,
            "cumulativeChangePct": 5.00884462217801,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-04-07",
            "sessionsAgo": 1
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-04-07",
            "sessionsAgo": 1
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-04-08",
            "sessionsAgo": 0
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-09",
        "VIX": 19.49,
        "VIX3M": 21.81,
        "ratio": 0.8936267767079321,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.4836,
            "dailyChangePct": 0.5769076660789629,
            "cumulativeChangePct": 4.546855281081008,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 608.8825,
            "dailyChangePct": 0.676464757346884,
            "cumulativeChangePct": 5.719192448144184,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "VIX_CROSS_25",
            "date": "2026-04-07",
            "sessionsAgo": 2
          },
          {
            "type": "RATIO_CROSS_1",
            "date": "2026-04-07",
            "sessionsAgo": 2
          },
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-04-08",
            "sessionsAgo": 1
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-10",
        "VIX": 19.23,
        "VIX3M": 21.86,
        "ratio": 0.8796889295516926,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 676.0359,
            "dailyChangePct": -0.06618046616356787,
            "cumulativeChangePct": 4.477665684896648,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 609.7606,
            "dailyChangePct": 0.1442150168546208,
            "cumulativeChangePct": 5.8716553993518605,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [
          {
            "type": "TERM_STRUCTURE_NORMALIZED",
            "date": "2026-04-08",
            "sessionsAgo": 2
          }
        ],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-13",
        "VIX": 19.12,
        "VIX3M": 21.34,
        "ratio": 0.8959700093720713,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 682.6424,
            "dailyChangePct": 0.9772410015503663,
            "cumulativeChangePct": 5.498664271432152,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 616.0671,
            "dailyChangePct": 1.0342583630362556,
            "cumulativeChangePct": 6.966641849404587,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-14",
        "VIX": 18.36,
        "VIX3M": 20.82,
        "ratio": 0.8818443804034581,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 690.9603,
            "dailyChangePct": 1.2184856961712232,
            "cumulativeChangePct": 6.78415040523126,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 627.2531,
            "dailyChangePct": 1.8157113080701892,
            "cumulativeChangePct": 8.908847261327146,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-15",
        "VIX": 18.17,
        "VIX3M": 20.78,
        "ratio": 0.8743984600577479,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 696.4127,
            "dailyChangePct": 0.7891046707025007,
            "cumulativeChangePct": 7.626789123648936,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 636.0342,
            "dailyChangePct": 1.399929310831638,
            "cumulativeChangePct": 10.433494136227317,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-16",
        "VIX": 17.94,
        "VIX3M": 20.77,
        "ratio": 0.863745787193067,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 698.124,
            "dailyChangePct": 0.24573072834541687,
            "cumulativeChangePct": 7.891261216457268,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 639.0976,
            "dailyChangePct": 0.48164076711598725,
            "cumulativeChangePct": 10.96538686453803,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-17",
        "VIX": 17.48,
        "VIX3M": 20.51,
        "ratio": 0.8522671867381765,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 706.5613,
            "dailyChangePct": 1.2085675324154277,
            "cumulativeChangePct": 9.195199969832913,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 647.4597,
            "dailyChangePct": 1.308423001432013,
            "cumulativeChangePct": 12.417283509901655,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-20",
        "VIX": 18.87,
        "VIX3M": 21.24,
        "ratio": 0.8884180790960453,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 705.1484,
            "dailyChangePct": -0.19996849530251604,
            "cumulativeChangePct": 8.97684397151064,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 645.4041,
            "dailyChangePct": -0.31748694165830704,
            "cumulativeChangePct": 12.060373314590734,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-21",
        "VIX": 19.5,
        "VIX3M": 21.51,
        "ratio": 0.906555090655509,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 700.5318,
            "dailyChangePct": -0.6546990676005282,
            "cumulativeChangePct": 8.263373590128676,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 642.9493,
            "dailyChangePct": -0.3803508530547006,
            "cumulativeChangePct": 11.634150728752402,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-22",
        "VIX": 18.92,
        "VIX3M": 21.24,
        "ratio": 0.8907721280602638,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 707.6259,
            "dailyChangePct": 1.0126735146070542,
            "cumulativeChangePct": 9.359728100495989,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 653.7062,
            "dailyChangePct": 1.6730557137242252,
            "cumulativeChangePct": 13.501852265987324,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-23",
        "VIX": 19.31,
        "VIX3M": 21.48,
        "ratio": 0.898975791433892,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 704.8798,
            "dailyChangePct": -0.3880722850873597,
            "cumulativeChangePct": 8.935333304691095,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 650.0242,
            "dailyChangePct": -0.5632499737649788,
            "cumulativeChangePct": 12.862553112876384,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-24",
        "VIX": 18.71,
        "VIX3M": 21.3,
        "ratio": 0.8784037558685446,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 710.3421,
            "dailyChangePct": 0.7749264484526286,
            "cumulativeChangePct": 9.779502014179142,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 662.4575,
            "dailyChangePct": 1.9127441716785265,
            "cumulativeChangePct": 15.021325019550535,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-27",
        "VIX": 18.02,
        "VIX3M": 20.77,
        "ratio": 0.8675974963890226,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 711.5659,
            "dailyChangePct": 0.17228318580584379,
            "cumulativeChangePct": 9.968633637610957,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-03-30"
          },
          "QQQ": {
            "adjustedClose": 662.8067,
            "dailyChangePct": 0.05271281553911322,
            "cumulativeChangePct": 15.081955998438712,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-03-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-28",
        "VIX": 17.83,
        "VIX3M": 20.49,
        "ratio": 0.8701805758906783,
        "currentRiskDuration": 15,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 708.1035,
            "dailyChangePct": -0.48658880365121115,
            "cumulativeChangePct": 9.433538578802136,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-03-31"
          },
          "QQQ": {
            "adjustedClose": 656.141,
            "dailyChangePct": -1.005677824318918,
            "cumulativeChangePct": 13.924602287169963,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-03-31"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-29",
        "VIX": 18.81,
        "VIX3M": 21.19,
        "ratio": 0.8876828692779611,
        "currentRiskDuration": 16,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 707.994,
            "dailyChangePct": -0.015463841091034602,
            "cumulativeChangePct": 9.416615950296015,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-01"
          },
          "QQQ": {
            "adjustedClose": 660.1524,
            "dailyChangePct": 0.611362496780421,
            "cumulativeChangePct": 14.621094580159966,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-01"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-04-30",
        "VIX": 16.89,
        "VIX3M": 20.08,
        "ratio": 0.8411354581673308,
        "currentRiskDuration": 17,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 715.0383,
            "dailyChangePct": 0.9949660590343967,
            "cumulativeChangePct": 10.505274141945463,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-02"
          },
          "QQQ": {
            "adjustedClose": 666.3092,
            "dailyChangePct": 0.9326331313799896,
            "cumulativeChangePct": 15.690088883764929,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-02"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-05",
    "monthLabel": "2026年5月",
    "status": "complete",
    "asOfDate": "2026-05-29",
    "expectedSessions": 20,
    "observedSessions": 20,
    "priorSession": {
      "date": "2026-04-30",
      "VIX": 16.89,
      "VIX3M": 20.08,
      "ratio": 0.8411354581673308,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 5.262585234944761,
        "baselineClose": 715.0383,
        "baselineDate": "2026-04-30"
      },
      "QQQ": {
        "monthlyChangePct": 10.568486822634293,
        "baselineClose": 666.3092,
        "baselineDate": "2026-04-30"
      },
      "vixMax": {
        "value": 18.43,
        "date": "2026-05-15"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-05-01",
        "VIX": 16.99,
        "VIX3M": 20.37,
        "ratio": 0.8340697103583701,
        "currentRiskDuration": 18,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 717.0183,
            "dailyChangePct": 0.27690824393600266,
            "cumulativeChangePct": 0.27690824393600266,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-06"
          },
          "QQQ": {
            "adjustedClose": 672.7055,
            "dailyChangePct": 0.9599597304074337,
            "cumulativeChangePct": 0.9599597304074337,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-06"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-04",
        "VIX": 18.29,
        "VIX3M": 21.05,
        "ratio": 0.8688836104513064,
        "currentRiskDuration": 19,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 714.3916,
            "dailyChangePct": -0.36633653562258006,
            "cumulativeChangePct": -0.09044270775425689,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-07"
          },
          "QQQ": {
            "adjustedClose": 671.4382,
            "dailyChangePct": -0.18838852960173513,
            "cumulativeChangePct": 0.7697627467848189,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-05",
        "VIX": 17.38,
        "VIX3M": 20.82,
        "ratio": 0.834774255523535,
        "currentRiskDuration": 20,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 720.1226,
            "dailyChangePct": 0.8022210787472783,
            "cumulativeChangePct": 0.711052820527236,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-08"
          },
          "QQQ": {
            "adjustedClose": 680.1495,
            "dailyChangePct": 1.2974090541765237,
            "cumulativeChangePct": 2.077158772533827,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-08"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-06",
        "VIX": 17.39,
        "VIX3M": 20.57,
        "ratio": 0.8454059309674283,
        "currentRiskDuration": 21,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 730.1319,
            "dailyChangePct": 1.3899438790005991,
            "cumulativeChangePct": 2.1108799346832186,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-04-10"
          },
          "QQQ": {
            "adjustedClose": 694.2791,
            "dailyChangePct": 2.077425624807483,
            "cumulativeChangePct": 4.1977358259498665,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-09"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-07",
        "VIX": 17.08,
        "VIX3M": 20.35,
        "ratio": 0.8393120393120391,
        "currentRiskDuration": 22,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 727.8932,
            "dailyChangePct": -0.30661583201609943,
            "cumulativeChangePct": 1.7977918105925195,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-10"
          },
          "QQQ": {
            "adjustedClose": 693.4509,
            "dailyChangePct": -0.11928920228189144,
            "cumulativeChangePct": 4.07343917808729,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-08",
        "VIX": 17.19,
        "VIX3M": 20.5,
        "ratio": 0.8385365853658537,
        "currentRiskDuration": 23,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 733.9028,
            "dailyChangePct": 0.8256156260286529,
            "cumulativeChangePct": 2.6382502867328794,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-13"
          },
          "QQQ": {
            "adjustedClose": 709.706,
            "dailyChangePct": 2.344088096215602,
            "cumulativeChangePct": 6.513012277183017,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-13"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-11",
        "VIX": 18.38,
        "VIX3M": 21.24,
        "ratio": 0.8653483992467044,
        "currentRiskDuration": 24,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 735.5743,
            "dailyChangePct": 0.2277549561059189,
            "cumulativeChangePct": 2.8720139886212914,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-14"
          },
          "QQQ": {
            "adjustedClose": 711.7616,
            "dailyChangePct": 0.2896410626372026,
            "cumulativeChangePct": 6.821517697789559,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-14"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-12",
        "VIX": 17.99,
        "VIX3M": 21.04,
        "ratio": 0.8550380228136881,
        "currentRiskDuration": 25,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 734.46,
            "dailyChangePct": -0.15148707615260104,
            "cumulativeChangePct": 2.716176182450636,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-15"
          },
          "QQQ": {
            "adjustedClose": 705.7245,
            "dailyChangePct": -0.8481913045042089,
            "cumulativeChangePct": 5.915466873337483,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-13",
        "VIX": 17.87,
        "VIX3M": 21.18,
        "ratio": 0.8437204910292729,
        "currentRiskDuration": 26,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 738.5692,
            "dailyChangePct": 0.5594858807831615,
            "cumulativeChangePct": 3.290858685471809,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-16"
          },
          "QQQ": {
            "adjustedClose": 713.1785,
            "dailyChangePct": 1.0562195304258282,
            "cumulativeChangePct": 7.034166720195367,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-14",
        "VIX": 17.26,
        "VIX3M": 20.85,
        "ratio": 0.8278177458033573,
        "currentRiskDuration": 27,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 744.3996,
            "dailyChangePct": 0.7894182427320207,
            "cumulativeChangePct": 4.106255567009476,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-04-21"
          },
          "QQQ": {
            "adjustedClose": 718.2477,
            "dailyChangePct": 0.710789795261646,
            "cumulativeChangePct": 7.794954654685848,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-15",
        "VIX": 18.43,
        "VIX3M": 21.36,
        "ratio": 0.8628277153558053,
        "currentRiskDuration": 28,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 735.445,
            "dailyChangePct": -1.2029291794353303,
            "cumulativeChangePct": 2.853931041176394,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-04-21"
          },
          "QQQ": {
            "adjustedClose": 707.4109,
            "dailyChangePct": -1.5087831120099704,
            "cumulativeChangePct": 6.168562583257131,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-18",
        "VIX": 17.82,
        "VIX3M": 20.92,
        "ratio": 0.8518164435946463,
        "currentRiskDuration": 29,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 734.9276,
            "dailyChangePct": -0.07035196377703778,
            "cumulativeChangePct": 2.7815712808670456,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-21"
          },
          "QQQ": {
            "adjustedClose": 704.3675,
            "dailyChangePct": -0.4302167241132415,
            "cumulativeChangePct": 5.711807671273328,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-21"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-19",
        "VIX": 18.06,
        "VIX3M": 21.12,
        "ratio": 0.8551136363636362,
        "currentRiskDuration": 30,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 730.0324,
            "dailyChangePct": -0.6660792165105733,
            "cumulativeChangePct": 2.0969645961621985,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-04-23"
          },
          "QQQ": {
            "adjustedClose": 700.0268,
            "dailyChangePct": -0.6162550089264474,
            "cumulativeChangePct": 5.060353361472414,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-04-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-20",
        "VIX": 17.44,
        "VIX3M": 20.76,
        "ratio": 0.8400770712909441,
        "currentRiskDuration": 31,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 737.5145,
            "dailyChangePct": 1.0248997167796814,
            "cumulativeChangePct": 3.1433560971489083,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-23"
          },
          "QQQ": {
            "adjustedClose": 711.6219,
            "dailyChangePct": 1.6563794414728106,
            "cumulativeChangePct": 6.80055145569054,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-04-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-21",
        "VIX": 16.76,
        "VIX3M": 20,
        "ratio": 0.8380000000000001,
        "currentRiskDuration": 32,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 738.9771,
            "dailyChangePct": 0.1983147449982292,
            "cumulativeChangePct": 3.3479045807755847,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2026-04-29"
          },
          "QQQ": {
            "adjustedClose": 712.979,
            "dailyChangePct": 0.1907052045475366,
            "cumulativeChangePct": 7.004225665802011,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-04-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-22",
        "VIX": 16.7,
        "VIX3M": 20.03,
        "ratio": 0.8337493759360958,
        "currentRiskDuration": 33,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 741.8824,
            "dailyChangePct": 0.3931515604475466,
            "cumulativeChangePct": 3.754218480324756,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-04-29"
          },
          "QQQ": {
            "adjustedClose": 716.0025,
            "dailyChangePct": 0.42406578594882394,
            "cumulativeChangePct": 7.457993976370125,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-04-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-26",
        "VIX": 17.01,
        "VIX3M": 19.89,
        "ratio": 0.8552036199095023,
        "currentRiskDuration": 34,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 746.8074,
            "dailyChangePct": 0.6638518449824549,
            "cumulativeChangePct": 4.4429927739535025,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-04-29"
          },
          "QQQ": {
            "adjustedClose": 728.7152,
            "dailyChangePct": 1.7755105603681542,
            "cumulativeChangePct": 9.365922007380355,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-27",
        "VIX": 16.29,
        "VIX3M": 19.45,
        "ratio": 0.8375321336760926,
        "currentRiskDuration": 35,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 746.6781,
            "dailyChangePct": -0.01731370096226259,
            "cumulativeChangePct": 4.424909826508583,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-29"
          },
          "QQQ": {
            "adjustedClose": 727.887,
            "dailyChangePct": -0.11365208245965874,
            "cumulativeChangePct": 9.241625359517759,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-28",
        "VIX": 15.74,
        "VIX3M": 19.11,
        "ratio": 0.8236525379382522,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 750.7972,
            "dailyChangePct": 0.5516567313277321,
            "cumulativeChangePct": 5.0009768707494295,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-05-04"
          },
          "QQQ": {
            "adjustedClose": 734.0238,
            "dailyChangePct": 0.8430978984375503,
            "cumulativeChangePct": 10.162639207142865,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-04-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-05-29",
        "VIX": 15.32,
        "VIX3M": 18.66,
        "ratio": 0.8210075026795284,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 752.6678,
            "dailyChangePct": 0.24914850508235276,
            "cumulativeChangePct": 5.262585234944761,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-05-04"
          },
          "QQQ": {
            "adjustedClose": 736.728,
            "dailyChangePct": 0.36840767288470744,
            "cumulativeChangePct": 10.568486822634293,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-05-04"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-06",
    "monthLabel": "2026年6月",
    "status": "complete",
    "asOfDate": "2026-06-30",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2026-05-29",
      "VIX": 15.32,
      "VIX3M": 18.66,
      "ratio": 0.8210075026795284,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": -1.029325287995586,
        "baselineClose": 752.6678,
        "baselineDate": "2026-05-29"
      },
      "QQQ": {
        "monthlyChangePct": -0.14863015929894585,
        "baselineClose": 736.728,
        "baselineDate": "2026-05-29"
      },
      "vixMax": {
        "value": 22.22,
        "date": "2026-06-10"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-06-01",
        "VIX": 16.05,
        "VIX3M": 19.43,
        "ratio": 0.8260422027792075,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 754.7174,
            "dailyChangePct": 0.2723113703017477,
            "cumulativeChangePct": 0.2723113703017477,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-05-04"
          },
          "QQQ": {
            "adjustedClose": 741.1485,
            "dailyChangePct": 0.6000179170603026,
            "cumulativeChangePct": 0.6000179170603026,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-05-04"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-02",
        "VIX": 15.77,
        "VIX3M": 19.49,
        "ratio": 0.8091328886608518,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 755.7422,
            "dailyChangePct": 0.13578592463880934,
            "cumulativeChangePct": 0.4084670554526104,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-05-05"
          },
          "QQQ": {
            "adjustedClose": 744.5611,
            "dailyChangePct": 0.46044753514309367,
            "cumulativeChangePct": 1.063228219912915,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-05-05"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-03",
        "VIX": 16.06,
        "VIX3M": 19.76,
        "ratio": 0.8127530364372468,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 750.439,
            "dailyChangePct": -0.7017207719775431,
            "cumulativeChangePct": -0.29612001469971894,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-05-07"
          },
          "QQQ": {
            "adjustedClose": 742.6153,
            "dailyChangePct": -0.2613351677921316,
            "cumulativeChangePct": 0.7991144628682667,
            "priceAction": "RECOVERY",
            "daysSinceLow": 18,
            "lowDate": "2026-05-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-04",
        "VIX": 15.4,
        "VIX3M": 19.23,
        "ratio": 0.8008320332813312,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 753.2747,
            "dailyChangePct": 0.3778721521669359,
            "cumulativeChangePct": 0.08063318239468487,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-05-07"
          },
          "QQQ": {
            "adjustedClose": 739.023,
            "dailyChangePct": -0.4837363302372055,
            "cumulativeChangePct": 0.3115125256539786,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-05-07"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-05",
        "VIX": 21.51,
        "VIX3M": 21.82,
        "ratio": 0.9857928505957837,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 733.8331,
            "dailyChangePct": -2.5809442425187124,
            "cumulativeChangePct": -2.5023921576026065,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-05-19"
          },
          "QQQ": {
            "adjustedClose": 703.5492,
            "dailyChangePct": -4.800094178394987,
            "cumulativeChangePct": -4.503534547349897,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-05-19"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-08",
        "VIX": 18.92,
        "VIX3M": 20.79,
        "ratio": 0.9100529100529102,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 735.4947,
            "dailyChangePct": 0.22642750783523624,
            "cumulativeChangePct": -2.281630753966102,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-05-19"
          },
          "QQQ": {
            "adjustedClose": 714.5356,
            "dailyChangePct": 1.5615681177663099,
            "cumulativeChangePct": -3.0122921892475785,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-05-19"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-09",
        "VIX": 19.87,
        "VIX3M": 21.31,
        "ratio": 0.9324260910370719,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 733.3357,
            "dailyChangePct": -0.29354392356599757,
            "cumulativeChangePct": -2.568477089095622,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-05-19"
          },
          "QQQ": {
            "adjustedClose": 706.3133,
            "dailyChangePct": -1.150719432313807,
            "cumulativeChangePct": -4.128348589981634,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-05-19"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-10",
        "VIX": 22.22,
        "VIX3M": 22.89,
        "ratio": 0.9707295762341633,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "ELEVATED",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 721.7742,
            "dailyChangePct": -1.5765630938191055,
            "cumulativeChangePct": -4.104546521054853,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 692.2036,
            "dailyChangePct": -1.9976545818972902,
            "cumulativeChangePct": -6.043533027114467,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-11",
        "VIX": 19.44,
        "VIX3M": 21.42,
        "ratio": 0.907563025210084,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 734.0421,
            "dailyChangePct": 1.699686688717894,
            "cumulativeChangePct": -2.4746242631875637,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 715.5834,
            "dailyChangePct": 3.377590061652369,
            "cumulativeChangePct": -2.8700687363585997,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-12",
        "VIX": 17.68,
        "VIX3M": 20.51,
        "ratio": 0.8620185275475377,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 738.012,
            "dailyChangePct": 0.5408272904237954,
            "cumulativeChangePct": -1.9471804161145356,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 719.7943,
            "dailyChangePct": 0.5884569150150787,
            "cumulativeChangePct": -2.298500939288306,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-15",
        "VIX": 16.2,
        "VIX3M": 19.36,
        "ratio": 0.8367768595041322,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 751.0261,
            "dailyChangePct": 1.7633995111190792,
            "cumulativeChangePct": -0.21811747493383216,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 742.4058,
            "dailyChangePct": 3.1413835869497753,
            "cumulativeChangePct": 0.7706779164087685,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-16",
        "VIX": 16.41,
        "VIX3M": 19.53,
        "ratio": 0.8402457757296466,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 746.5487,
            "dailyChangePct": -0.5961710252146979,
            "cumulativeChangePct": -0.8129881469620459,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 728.2961,
            "dailyChangePct": -1.9005374149824728,
            "cumulativeChangePct": -1.1445065207240535,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-17",
        "VIX": 18.44,
        "VIX3M": 20.62,
        "ratio": 0.8942774005819593,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 737.226,
            "dailyChangePct": -1.2487731878710773,
            "cumulativeChangePct": -2.051608956833284,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 720.9618,
            "dailyChangePct": -1.0070491933157344,
            "cumulativeChangePct": -2.140029970355395,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-18",
        "VIX": 16.4,
        "VIX3M": 19.57,
        "ratio": 0.8380173735309145,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 744.8905,
            "dailyChangePct": 1.039640490161764,
            "cumulativeChangePct": -1.0332978240865431,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 739.033,
            "dailyChangePct": 2.5065405684461917,
            "cumulativeChangePct": 0.31286987870693395,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-22",
        "VIX": 17.28,
        "VIX3M": 19.76,
        "ratio": 0.8744939271255061,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 742.5463,
            "dailyChangePct": -0.3147039732685597,
            "cumulativeChangePct": -1.3447499680469988,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 737.1814,
            "dailyChangePct": -0.25054361577899753,
            "cumulativeChangePct": 0.06154238742115403,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-23",
        "VIX": 19.49,
        "VIX3M": 21.06,
        "ratio": 0.9254510921177588,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 731.763,
            "dailyChangePct": -1.4522057412446832,
            "cumulativeChangePct": -2.7774271730503175,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 712.9067,
            "dailyChangePct": -3.2929072817084126,
            "cumulativeChangePct": -3.233391428043997,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-24",
        "VIX": 18.63,
        "VIX3M": 20.37,
        "ratio": 0.9145802650957289,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 731.4239,
            "dailyChangePct": -0.04634014018199961,
            "cumulativeChangePct": -2.8224802495868784,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 709.8799,
            "dailyChangePct": -0.4245716865895588,
            "cumulativeChangePct": -3.6442350501134646,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-25",
        "VIX": 18.89,
        "VIX3M": 20.33,
        "ratio": 0.9291687161829809,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 732.4813,
            "dailyChangePct": 0.14456732956087404,
            "cumulativeChangePct": -2.6819933043502053,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 715.6339,
            "dailyChangePct": 0.8105596453710007,
            "cumulativeChangePct": -2.8632141034411474,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-26",
        "VIX": 18.41,
        "VIX3M": 20.13,
        "ratio": 0.9145553899652261,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 727.1844,
            "dailyChangePct": -0.7231447410329883,
            "cumulativeChangePct": -3.385743351847925,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 705.7841,
            "dailyChangePct": -1.3763741488490244,
            "cumulativeChangePct": -4.200179713544205,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-29",
        "VIX": 17.65,
        "VIX3M": 19.53,
        "ratio": 0.90373783922171,
        "currentRiskDuration": 12,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 739.1647,
            "dailyChangePct": 1.6474913378229816,
            "cumulativeChangePct": -1.7940318424675583,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 723.3258,
            "dailyChangePct": 2.4854201164350442,
            "cumulativeChangePct": -1.8191517086360243,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-06-30",
        "VIX": 16.45,
        "VIX3M": 19,
        "ratio": 0.8657894736842104,
        "currentRiskDuration": 13,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 744.9204,
            "dailyChangePct": 0.7786762544260917,
            "cumulativeChangePct": -1.029325287995586,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 735.633,
            "dailyChangePct": 1.7014739416180147,
            "cumulativeChangePct": -0.14863015929894585,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-07",
    "monthLabel": "2026年7月",
    "status": "complete",
    "asOfDate": "2026-07-31",
    "expectedSessions": 22,
    "observedSessions": 22,
    "priorSession": {
      "date": "2026-06-30",
      "VIX": 16.45,
      "VIX3M": 19,
      "ratio": 0.8657894736842104,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 0.03480908832675933,
        "baselineClose": 744.9204,
        "baselineDate": "2026-06-30"
      },
      "QQQ": {
        "monthlyChangePct": -6.573875832106502,
        "baselineClose": 735.633,
        "baselineDate": "2026-06-30"
      },
      "vixMax": {
        "value": 20.66,
        "date": "2026-07-29"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-07-01",
        "VIX": 16.59,
        "VIX3M": 19.16,
        "ratio": 0.865866388308977,
        "currentRiskDuration": 14,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 743.9129,
            "dailyChangePct": -0.1352493501318941,
            "cumulativeChangePct": -0.1352493501318941,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 724.4147,
            "dailyChangePct": -1.5249859644686947,
            "cumulativeChangePct": -1.5249859644686947,
            "priceAction": "RECOVERY",
            "daysSinceLow": 14,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-02",
        "VIX": 16.15,
        "VIX3M": 19.04,
        "ratio": 0.8482142857142857,
        "currentRiskDuration": 15,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 742.9353,
            "dailyChangePct": -0.1314132339955476,
            "cumulativeChangePct": -0.2664848485824822,
            "priceAction": "RECOVERY",
            "daysSinceLow": 15,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 711.8578,
            "dailyChangePct": -1.7333855870125259,
            "cumulativeChangePct": -3.231937664569162,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-06",
        "VIX": 15.57,
        "VIX3M": 18.78,
        "ratio": 0.829073482428115,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 749.4192,
            "dailyChangePct": 0.8727408698981032,
            "cumulativeChangePct": 0.6039302991299511,
            "priceAction": "RECOVERY",
            "daysSinceLow": 16,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 722.0671,
            "dailyChangePct": 1.4341768819559064,
            "cumulativeChangePct": -1.844112485437721,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-07",
        "VIX": 16.13,
        "VIX3M": 19.01,
        "ratio": 0.8485007890583902,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 745.858,
            "dailyChangePct": -0.4751946574093724,
            "cumulativeChangePct": 0.12586579720463842,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 708.6911,
            "dailyChangePct": -1.8524594182452003,
            "cumulativeChangePct": -3.6624104682633885,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-08",
        "VIX": 16.9,
        "VIX3M": 19.46,
        "ratio": 0.8684480986639259,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 743.5538,
            "dailyChangePct": -0.30893279954091746,
            "cumulativeChangePct": -0.18345584306724838,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 710.699,
            "dailyChangePct": 0.2833251327694075,
            "cumulativeChangePct": -3.389461864815757,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-09",
        "VIX": 15.84,
        "VIX3M": 18.99,
        "ratio": 0.8341232227488152,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 749.8481,
            "dailyChangePct": 0.8465157464059736,
            "cumulativeChangePct": 0.6615069207394519,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-06-10"
          },
          "QQQ": {
            "adjustedClose": 722.5267,
            "dailyChangePct": 1.6642347885673203,
            "cumulativeChangePct": -1.7816356797479171,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-06-10"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-10",
        "VIX": 15.03,
        "VIX3M": 18.57,
        "ratio": 0.8093699515347333,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 753.0801,
            "dailyChangePct": 0.4310206293781427,
            "cumulativeChangePct": 1.0953787814107496,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 724.7543,
            "dailyChangePct": 0.3083069456118359,
            "cumulativeChangePct": -1.4788216406822596,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-06-26"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-13",
        "VIX": 17.16,
        "VIX3M": 19.64,
        "ratio": 0.8737270875763747,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 747.3144,
            "dailyChangePct": -0.7656157691592225,
            "cumulativeChangePct": 0.32137661956901376,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 710.9987,
            "dailyChangePct": -1.8979673525220786,
            "cumulativeChangePct": -3.348721441262159,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-06-26"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-14",
        "VIX": 16.5,
        "VIX3M": 19.3,
        "ratio": 0.854922279792746,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 749.9678,
            "dailyChangePct": 0.35505805856277384,
            "cumulativeChangePct": 0.677575751717896,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 718.9404,
            "dailyChangePct": 1.1169781323088213,
            "cumulativeChangePct": -2.2691477951641725,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-06-26"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-15",
        "VIX": 15.67,
        "VIX3M": 18.91,
        "ratio": 0.8286620835536753,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 752.9405,
            "dailyChangePct": 0.39637701778663104,
            "cumulativeChangePct": 1.0766385240624565,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 716.9924,
            "dailyChangePct": -0.2709543099817413,
            "cumulativeChangePct": -2.5339537513950683,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-06-26"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-16",
        "VIX": 16.73,
        "VIX3M": 19.5,
        "ratio": 0.857948717948718,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 748.8606,
            "dailyChangePct": -0.5418622055793354,
            "cumulativeChangePct": 0.528942421230516,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 705.2047,
            "dailyChangePct": -1.6440481098544346,
            "cumulativeChangePct": -4.136342442495112,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-16"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-17",
        "VIX": 18.77,
        "VIX3M": 20.54,
        "ratio": 0.9138266796494645,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 741.449,
            "dailyChangePct": -0.9897169112649262,
            "cumulativeChangePct": -0.46600952262819684,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 694.6058,
            "dailyChangePct": -1.502953681392083,
            "cumulativeChangePct": -5.577128812872722,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-20",
        "VIX": 18.65,
        "VIX3M": 20.4,
        "ratio": 0.9142156862745098,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 740.252,
            "dailyChangePct": -0.16144063853347213,
            "cumulativeChangePct": -0.6266978324127037,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 695.335,
            "dailyChangePct": 0.10498040759232552,
            "cumulativeChangePct": -5.478003297840095,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-07-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-21",
        "VIX": 17.05,
        "VIX3M": 19.59,
        "ratio": 0.8703420112302196,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 746.4266,
            "dailyChangePct": 0.8341213532689018,
            "cumulativeChangePct": 0.20219610041556368,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 708.2316,
            "dailyChangePct": 1.8547318918219258,
            "cumulativeChangePct": -3.724873680218277,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-07-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-22",
        "VIX": 16.64,
        "VIX3M": 19.54,
        "ratio": 0.8515864892528148,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 745.5588,
            "dailyChangePct": -0.11626059414281409,
            "cumulativeChangePct": 0.08570043188507181,
            "priceAction": "RECOVERY",
            "daysSinceLow": 17,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 704.6153,
            "dailyChangePct": -0.5106098061707365,
            "cumulativeChangePct": -4.216463916110347,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-07-17"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-23",
        "VIX": 18.7,
        "VIX3M": 20.6,
        "ratio": 0.9077669902912621,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 736.3517,
            "dailyChangePct": -1.234926071558673,
            "cumulativeChangePct": -1.1502839766503792,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 691.2393,
            "dailyChangePct": -1.8983408393204226,
            "cumulativeChangePct": -6.034761898936026,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-23"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-24",
        "VIX": 18.58,
        "VIX3M": 20.51,
        "ratio": 0.9058995611896634,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 737.0998,
            "dailyChangePct": 0.1015954740105629,
            "cumulativeChangePct": -1.0498571390983535,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-06-26"
          },
          "QQQ": {
            "adjustedClose": 683.5173,
            "dailyChangePct": -1.1171239829679824,
            "cumulativeChangePct": -7.084470109415985,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-27",
        "VIX": 18.67,
        "VIX3M": 20.2,
        "ratio": 0.9242574257425744,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 737.2594,
            "dailyChangePct": 0.02165242752745211,
            "cumulativeChangePct": -1.02843203112708,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-07-23"
          },
          "QQQ": {
            "adjustedClose": 681.4095,
            "dailyChangePct": -0.30837551587941103,
            "cumulativeChangePct": -7.37099885404815,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-27"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-28",
        "VIX": 18.21,
        "VIX3M": 19.86,
        "ratio": 0.9169184290030212,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 739.025,
            "dailyChangePct": 0.23948151763137915,
            "cumulativeChangePct": -0.791413418131659,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-07-23"
          },
          "QQQ": {
            "adjustedClose": 674.7864,
            "dailyChangePct": -0.9719705991771521,
            "cumulativeChangePct": -8.271325511498272,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-28"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-29",
        "VIX": 20.66,
        "VIX3M": 21.5,
        "ratio": 0.9609302325581396,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 727.6533,
            "dailyChangePct": -1.5387436148980083,
            "cumulativeChangePct": -2.317979209590715,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 661.0408,
            "dailyChangePct": -2.03702979194601,
            "cumulativeChangePct": -10.139865938586235,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-30",
        "VIX": 17.09,
        "VIX3M": 19.5,
        "ratio": 0.8764102564102564,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 739.853,
            "dailyChangePct": 1.676581415902323,
            "cumulativeChangePct": -0.6802606023408653,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 682.838,
            "dailyChangePct": 3.2974061510272934,
            "cumulativeChangePct": -7.176812350723805,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-07-31",
        "VIX": 15.99,
        "VIX3M": 19.02,
        "ratio": 0.8406940063091483,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 745.1797,
            "dailyChangePct": 0.7199673448644583,
            "cumulativeChangePct": 0.03480908832675933,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 687.2734,
            "dailyChangePct": 0.64955377410163,
            "cumulativeChangePct": -6.573875832106502,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-08",
    "monthLabel": "2026年8月",
    "status": "complete",
    "asOfDate": "2026-08-31",
    "expectedSessions": 21,
    "observedSessions": 21,
    "priorSession": {
      "date": "2026-07-31",
      "VIX": 15.99,
      "VIX3M": 19.02,
      "ratio": 0.8406940063091483,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 2.679944179907201,
        "baselineClose": 745.1797,
        "baselineDate": "2026-07-31"
      },
      "QQQ": {
        "monthlyChangePct": 4.1817564887568714,
        "baselineClose": 687.2734,
        "baselineDate": "2026-07-31"
      },
      "vixMax": {
        "value": 16.5,
        "date": "2026-08-04"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-08-03",
        "VIX": 15.86,
        "VIX3M": 18.93,
        "ratio": 0.837823560486001,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "EASING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 755.7934,
            "dailyChangePct": 1.4243141620739364,
            "cumulativeChangePct": 1.4243141620739364,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 699.3408,
            "dailyChangePct": 1.755836905662278,
            "cumulativeChangePct": 1.755836905662278,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-04",
        "VIX": 16.5,
        "VIX3M": 19.34,
        "ratio": 0.8531540847983454,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 769.4195,
            "dailyChangePct": 1.8028868735821213,
            "cumulativeChangePct": 3.252879808722642,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 723.0961,
            "dailyChangePct": 3.3968131131488555,
            "cumulativeChangePct": 5.212292517068162,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-05",
        "VIX": 15.81,
        "VIX3M": 18.95,
        "ratio": 0.8343007915567283,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 767.8834,
            "dailyChangePct": -0.1996440173403391,
            "cumulativeChangePct": 3.046741611452908,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 716.5529,
            "dailyChangePct": -0.9048866395490074,
            "cumulativeChangePct": 4.260240538917981,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-06",
        "VIX": 15.15,
        "VIX3M": 18.69,
        "ratio": 0.8105939004815409,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 766.6564,
            "dailyChangePct": -0.15978988476637035,
            "cumulativeChangePct": 2.882083341776487,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 713.9057,
            "dailyChangePct": -0.3694353899063141,
            "cumulativeChangePct": 3.8750663127657736,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-07",
        "VIX": 14.9,
        "VIX3M": 18.72,
        "ratio": 0.795940170940171,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 771.3448,
            "dailyChangePct": 0.6115386240824527,
            "cumulativeChangePct": 3.5112470186721367,
            "priceAction": "RECOVERY",
            "daysSinceLow": 7,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 722.2769,
            "dailyChangePct": 1.172591842311932,
            "cumulativeChangePct": 5.093096866545377,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-10",
        "VIX": 15.46,
        "VIX3M": 18.98,
        "ratio": 0.8145416227608009,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 771.1153,
            "dailyChangePct": -0.029753230980478218,
            "cumulativeChangePct": 3.4804490782558872,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 720.1192,
            "dailyChangePct": -0.2987358449370259,
            "cumulativeChangePct": 4.779146115650623,
            "priceAction": "RECOVERY",
            "daysSinceLow": 8,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-11",
        "VIX": 15.28,
        "VIX3M": 18.91,
        "ratio": 0.8080380750925436,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 768.6515,
            "dailyChangePct": -0.31951123262630166,
            "cumulativeChangePct": 3.14981741987872,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 717.7017,
            "dailyChangePct": -0.33570831051303873,
            "cumulativeChangePct": 4.427393814455782,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 9,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-12",
        "VIX": 14.55,
        "VIX3M": 18.53,
        "ratio": 0.7852131678359417,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 770.5767,
            "dailyChangePct": 0.2504646123763443,
            "cumulativeChangePct": 3.4081712102463246,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 722.9462,
            "dailyChangePct": 0.7307353458964938,
            "cumulativeChangePct": 5.190481691856541,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 10,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-13",
        "VIX": 14.63,
        "VIX3M": 18.61,
        "ratio": 0.786136485760344,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 775.9533,
            "dailyChangePct": 0.6977371623097417,
            "cumulativeChangePct": 4.129688449645097,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 731.3075,
            "dailyChangePct": 1.1565590911190915,
            "cumulativeChangePct": 6.407071770855666,
            "priceAction": "RECOVERY",
            "daysSinceLow": 11,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-14",
        "VIX": 14.25,
        "VIX3M": 18.46,
        "ratio": 0.7719393282773565,
        "currentRiskDuration": 8,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 774.4171,
            "dailyChangePct": -0.19797583179297362,
            "cumulativeChangePct": 3.9235368327934728,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 730.3086,
            "dailyChangePct": -0.13659096891527334,
            "cumulativeChangePct": 6.2617293205294855,
            "priceAction": "RECOVERY",
            "daysSinceLow": 12,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-17",
        "VIX": 15.19,
        "VIX3M": 19.04,
        "ratio": 0.7977941176470589,
        "currentRiskDuration": 9,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 770.7562,
            "dailyChangePct": -0.4727297473157477,
            "cumulativeChangePct": 3.432259359722223,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 729.1098,
            "dailyChangePct": -0.16414978544686543,
            "cumulativeChangePct": 6.087300919837713,
            "priceAction": "RECOVERY",
            "daysSinceLow": 13,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-18",
        "VIX": 15.84,
        "VIX3M": 19.27,
        "ratio": 0.8220031136481578,
        "currentRiskDuration": 10,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 765.5492,
            "dailyChangePct": -0.6755703035538296,
            "cumulativeChangePct": 2.7335017311931553,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 716.7627,
            "dailyChangePct": -1.6934486410688732,
            "cumulativeChangePct": 4.290766964064074,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-19",
        "VIX": 14.89,
        "VIX3M": 18.57,
        "ratio": 0.8018309100700054,
        "currentRiskDuration": 11,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 767.1552,
            "dailyChangePct": 0.20978403478182361,
            "cumulativeChangePct": 2.9490202161975176,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 715.3342,
            "dailyChangePct": -0.1992988753460545,
            "cumulativeChangePct": 4.082916638414935,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 15,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-20",
        "VIX": 16.01,
        "VIX3M": 19.06,
        "ratio": 0.8399790136411334,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 760.7112,
            "dailyChangePct": -0.8399864851336591,
            "cumulativeChangePct": 2.0842623598039456,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 710.1895,
            "dailyChangePct": -0.7192022973318002,
            "cumulativeChangePct": 3.33434991082151,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 16,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-21",
        "VIX": 15.13,
        "VIX3M": 18.5,
        "ratio": 0.8178378378378379,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 763.8234,
            "dailyChangePct": 0.4091171524752246,
            "cumulativeChangePct": 2.5019065870957036,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 712.6969,
            "dailyChangePct": 0.3530606971801298,
            "cumulativeChangePct": 3.6991828870432064,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 17,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-24",
        "VIX": 15.85,
        "VIX3M": 18.56,
        "ratio": 0.8539870689655172,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 761.579,
            "dailyChangePct": -0.29383755459705396,
            "cumulativeChangePct": 2.200717491364834,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 705.5843,
            "dailyChangePct": -0.997983855408946,
            "cumulativeChangePct": 2.6642817836395105,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 18,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-25",
        "VIX": 15.45,
        "VIX3M": 18.21,
        "ratio": 0.8484349258649093,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 764.013,
            "dailyChangePct": 0.3195991486109939,
            "cumulativeChangePct": 2.5273501143415533,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-07-29"
          },
          "QQQ": {
            "adjustedClose": 709.9797,
            "dailyChangePct": 0.6229446998749832,
            "cumulativeChangePct": 3.3038234856754167,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-07-29"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-26",
        "VIX": 15.21,
        "VIX3M": 17.99,
        "ratio": 0.8454697053918845,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 764.1826,
            "dailyChangePct": 0.02219857515513013,
            "cumulativeChangePct": 2.550109725211236,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-07-30"
          },
          "QQQ": {
            "adjustedClose": 710.6291,
            "dailyChangePct": 0.09146740392718122,
            "cumulativeChangePct": 3.398312811175286,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 19,
            "lowDate": "2026-07-30"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-27",
        "VIX": 14.51,
        "VIX3M": 17.56,
        "ratio": 0.8263097949886106,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 769.1901,
            "dailyChangePct": 0.65527532293983,
            "cumulativeChangePct": 3.2220952878882825,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-07-31"
          },
          "QQQ": {
            "adjustedClose": 720.3589,
            "dailyChangePct": 1.3691811945218513,
            "cumulativeChangePct": 4.814023065638784,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-07-31"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-28",
        "VIX": 14.43,
        "VIX3M": 17.48,
        "ratio": 0.8255148741418764,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 767.4445,
            "dailyChangePct": -0.22693999831772116,
            "cumulativeChangePct": 2.9878430665784217,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-08-03"
          },
          "QQQ": {
            "adjustedClose": 715.6838,
            "dailyChangePct": -0.64899593799701,
            "cumulativeChangePct": 4.13378431349154,
            "priceAction": "RECOVERY",
            "daysSinceLow": 19,
            "lowDate": "2026-08-03"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-08-31",
        "VIX": 14.92,
        "VIX3M": 17.53,
        "ratio": 0.8511123787792355,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 765.1501,
            "dailyChangePct": -0.2989662444645824,
            "cumulativeChangePct": 2.679944179907201,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-08-20"
          },
          "QQQ": {
            "adjustedClose": 716.0135,
            "dailyChangePct": 0.046067830513973895,
            "cumulativeChangePct": 4.1817564887568714,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  },
  {
    "month": "2026-09",
    "monthLabel": "2026年9月",
    "status": "in_progress",
    "asOfDate": "2026-09-25",
    "expectedSessions": 18,
    "observedSessions": 18,
    "priorSession": {
      "date": "2026-08-31",
      "VIX": 14.92,
      "VIX3M": 17.53,
      "ratio": 0.8511123787792355,
      "inversionDays": 0,
      "durationExact": {
        "currentRisk": true,
        "inversion": true,
        "highStress": true,
        "extremeStress": true
      },
      "dataQuality": {
        "status": "complete",
        "issues": []
      }
    },
    "summary": {
      "SPY": {
        "monthlyChangePct": 0.8102854590230191,
        "baselineClose": 765.1501,
        "baselineDate": "2026-08-31"
      },
      "QQQ": {
        "monthlyChangePct": 3.978486439152329,
        "baselineClose": 716.0135,
        "baselineDate": "2026-08-31"
      },
      "vixMax": {
        "value": 17.84,
        "date": "2026-09-10"
      },
      "highStressDays": 0,
      "inversionDays": 0
    },
    "rows": [
      {
        "date": "2026-09-01",
        "VIX": 16.34,
        "VIX3M": 18.33,
        "ratio": 0.8914348063284234,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 759.8932,
            "dailyChangePct": -0.6870416667265622,
            "cumulativeChangePct": -0.6870416667265622,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 706.903,
            "dailyChangePct": -1.272392210482065,
            "cumulativeChangePct": -1.272392210482065,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-02",
        "VIX": 15.2,
        "VIX3M": 17.73,
        "ratio": 0.8573040045121263,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 763.2648,
            "dailyChangePct": 0.4436939296206477,
            "cumulativeChangePct": -0.24639609927514794,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 708.5013,
            "dailyChangePct": 0.22609891314648856,
            "cumulativeChangePct": -1.0491701622944216,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-03",
        "VIX": 14.32,
        "VIX3M": 17.42,
        "ratio": 0.8220436280137772,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 771.255,
            "dailyChangePct": 1.0468450791913941,
            "cumulativeChangePct": 0.7978695944756531,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 716.9225,
            "dailyChangePct": 1.1885934436535184,
            "cumulativeChangePct": 0.1269529135973002,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-04",
        "VIX": 14.53,
        "VIX3M": 17.61,
        "ratio": 0.825099375354912,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 768.2824,
            "dailyChangePct": -0.3854237573824415,
            "cumulativeChangePct": 0.40937065812316487,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 718.2112,
            "dailyChangePct": 0.17975443649766998,
            "cumulativeChangePct": 0.3069355535894047,
            "priceAction": "RECOVERY",
            "daysSinceLow": 9,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-08",
        "VIX": 15.72,
        "VIX3M": 18.39,
        "ratio": 0.8548123980424144,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 764.0628,
            "dailyChangePct": -0.5492251286766447,
            "cumulativeChangePct": -0.14210283707731808,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 717.6118,
            "dailyChangePct": -0.08345734513747205,
            "cumulativeChangePct": 0.22322204818763236,
            "priceAction": "RECOVERY",
            "daysSinceLow": 10,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-09",
        "VIX": 16.46,
        "VIX3M": 18.87,
        "ratio": 0.8722840487546369,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 760.5117,
            "dailyChangePct": -0.4647654616871777,
            "cumulativeChangePct": -0.6062078538576876,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 5,
            "lowDate": "2026-09-01"
          },
          "QQQ": {
            "adjustedClose": 715.5639,
            "dailyChangePct": -0.2853771356602586,
            "cumulativeChangePct": -0.06279211215990399,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 11,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-10",
        "VIX": 17.84,
        "VIX3M": 19.73,
        "ratio": 0.9042067916877851,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NEAR_FLAT",
        "riskDirection": "RISING",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 755.953,
            "dailyChangePct": -0.5994253605828836,
            "cumulativeChangePct": -1.2019994508267073,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-09-10"
          },
          "QQQ": {
            "adjustedClose": 707.9519,
            "dailyChangePct": -1.063776414657025,
            "cumulativeChangePct": -1.1259005591375049,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 12,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-11",
        "VIX": 15.84,
        "VIX3M": 18.6,
        "ratio": 0.8516129032258064,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 762.397,
            "dailyChangePct": 0.8524339476131626,
            "cumulativeChangePct": -0.35981175458251746,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-09-10"
          },
          "QQQ": {
            "adjustedClose": 714.1354,
            "dailyChangePct": 0.873435045516513,
            "cumulativeChangePct": -0.26229952368216347,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 13,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-14",
        "VIX": 17.1,
        "VIX3M": 19.28,
        "ratio": 0.8869294605809129,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 758.9954,
            "dailyChangePct": -0.44617174516689007,
            "cumulativeChangePct": -0.8043781213646795,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-09-10"
          },
          "QQQ": {
            "adjustedClose": 708.4413,
            "dailyChangePct": -0.7973417926068427,
            "cumulativeChangePct": -1.0575498925648796,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 14,
            "lowDate": "2026-08-24"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-15",
        "VIX": 17.2,
        "VIX3M": 19.36,
        "ratio": 0.8884297520661157,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 755.5141,
            "dailyChangePct": -0.4586720815435763,
            "cumulativeChangePct": -1.2593607450355093,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-09-15"
          },
          "QQQ": {
            "adjustedClose": 703.8062,
            "dailyChangePct": -0.6542673330874327,
            "cumulativeChangePct": -1.7048980221741727,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-16",
        "VIX": 17.71,
        "VIX3M": 19.73,
        "ratio": 0.8976178408514952,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "NORMAL",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 752.1823,
            "dailyChangePct": -0.4409977259193343,
            "cumulativeChangePct": -1.6948047187081206,
            "priceAction": "NEW_LOW",
            "daysSinceLow": 0,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 703.986,
            "dailyChangePct": 0.025546805356357893,
            "cumulativeChangePct": -1.6797867637970532,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-17",
        "VIX": 15.44,
        "VIX3M": 18.55,
        "ratio": 0.8323450134770889,
        "currentRiskDuration": 1,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 760.7112,
            "dailyChangePct": 1.1338873568282448,
            "cumulativeChangePct": -0.5801345383082301,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 1,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 716.1733,
            "dailyChangePct": 1.7311849951561653,
            "cumulativeChangePct": 0.022318014953626175,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-18",
        "VIX": 14.81,
        "VIX3M": 18.24,
        "ratio": 0.811951754385965,
        "currentRiskDuration": 2,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 761.69,
            "dailyChangePct": 0.12866906652617693,
            "cumulativeChangePct": -0.4522119254770973,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 2,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 720.6986,
            "dailyChangePct": 0.6318722018818557,
            "cumulativeChangePct": 0.6543312381680044,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-21",
        "VIX": 14.87,
        "VIX3M": 18.08,
        "ratio": 0.8224557522123894,
        "currentRiskDuration": 3,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 773.5,
            "dailyChangePct": 1.5504995470598137,
            "cumulativeChangePct": 1.0912760777264552,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 3,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 741.47,
            "dailyChangePct": 2.8821202094745146,
            "cumulativeChangePct": 3.5553100604946763,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-22",
        "VIX": 14.21,
        "VIX3M": 17.61,
        "ratio": 0.8069278818852925,
        "currentRiskDuration": 4,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 773.38,
            "dailyChangePct": -0.015513897866836768,
            "cumulativeChangePct": 1.0755928804034642,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 4,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 747.46,
            "dailyChangePct": 0.8078546670802655,
            "cumulativeChangePct": 4.391886465827821,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-23",
        "VIX": 15.18,
        "VIX3M": 18.11,
        "ratio": 0.8382109331860851,
        "currentRiskDuration": 5,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 767.81,
            "dailyChangePct": -0.7202151594300377,
            "cumulativeChangePct": 0.3476311379950081,
            "priceAction": "RECOVERY",
            "daysSinceLow": 5,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 741.21,
            "dailyChangePct": -0.8361651459609876,
            "cumulativeChangePct": 3.5189978959893953,
            "priceAction": "RECOVERY",
            "daysSinceLow": 6,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-24",
        "VIX": 15.67,
        "VIX3M": 18.43,
        "ratio": 0.850244167118828,
        "currentRiskDuration": 6,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 767.18,
            "dailyChangePct": -0.08205154921139268,
            "cumulativeChangePct": 0.26529435204936114,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 6,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 741.1,
            "dailyChangePct": -0.014840598480869716,
            "cumulativeChangePct": 3.503635057160226,
            "priceAction": "NO_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      },
      {
        "date": "2026-09-25",
        "VIX": 14.87,
        "VIX3M": 17.93,
        "ratio": 0.8293363078639152,
        "currentRiskDuration": 7,
        "inversionDays": 0,
        "highStressDays": 0,
        "extremeStressDays": 0,
        "currentRiskLevel": "LOW_VOLATILITY",
        "termStructure": "NORMAL_TERM_STRUCTURE",
        "riskDirection": "STABLE",
        "durationExact": {
          "currentRisk": true,
          "inversion": true,
          "highStress": true,
          "extremeStress": true
        },
        "durationTags": [],
        "prices": {
          "SPY": {
            "adjustedClose": 771.35,
            "dailyChangePct": 0.5435491019056826,
            "cumulativeChangePct": 0.8102854590230191,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 7,
            "lowDate": "2026-09-16"
          },
          "QQQ": {
            "adjustedClose": 744.5,
            "dailyChangePct": 0.4587774929159405,
            "cumulativeChangePct": 3.978486439152329,
            "priceAction": "EARLY_STABILIZATION",
            "daysSinceLow": 8,
            "lowDate": "2026-09-15"
          }
        },
        "eventFlags": [],
        "ready": true,
        "dataQuality": {
          "status": "complete",
          "issues": []
        }
      }
    ]
  }
];
