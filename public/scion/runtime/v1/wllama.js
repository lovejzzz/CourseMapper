var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/glue/messages.ts
var GLUE_VERSION = 2;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_webgpu",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "no_perf",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "seed",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_seq_max",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      }
    ]
  },
  "lora_req": {
    "name": "lora_req",
    "structName": "glue_msg_lora_load_req",
    "className": "GlueMsgLoraLoadReq",
    "fields": [
      {
        "type": "str",
        "name": "path",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "scale",
        "isNullable": false
      }
    ]
  },
  "lora_res": {
    "name": "lora_res",
    "structName": "glue_msg_lora_load_res",
    "className": "GlueMsgLoraLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "path",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "scale",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      }
    ]
  },
  "lorc_req": {
    "name": "lorc_req",
    "structName": "glue_msg_lora_clear_req",
    "className": "GlueMsgLoraClearReq",
    "fields": []
  },
  "lorc_res": {
    "name": "lorc_res",
    "structName": "glue_msg_lora_clear_res",
    "className": "GlueMsgLoraClearRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "lors_req": {
    "name": "lors_req",
    "structName": "glue_msg_lora_status_req",
    "className": "GlueMsgLoraStatusReq",
    "fields": []
  },
  "lors_res": {
    "name": "lors_res",
    "structName": "glue_msg_lora_status_res",
    "className": "GlueMsgLoraStatusRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "active",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "path",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "scale",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      }
    ]
  },
  "opti_req": {
    "name": "opti_req",
    "structName": "glue_msg_set_options_req",
    "className": "GlueMsgSetOptionsReq",
    "fields": [
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": false
      }
    ]
  },
  "opti_res": {
    "name": "opti_res",
    "structName": "glue_msg_set_options_res",
    "className": "GlueMsgSetOptionsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "sint_req": {
    "name": "sint_req",
    "structName": "glue_msg_sampling_init_req",
    "className": "GlueMsgSamplingInitReq",
    "fields": [
      {
        "type": "int",
        "name": "mirostat",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "mirostat_tau",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "mirostat_eta",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "temp",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "top_p",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "top_k",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "penalty_last_n",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_repeat",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_freq",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "penalty_present",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "dynatemp_range",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "dynatemp_exponent",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "samplers_sequence",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "grammar",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_prev",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_probs",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "min_p",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "typical_p",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "typ_p",
        "isNullable": true
      },
      {
        "type": "arr_int",
        "name": "logit_bias_toks",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "logit_bias_vals",
        "isNullable": true
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": true
      }
    ]
  },
  "sint_res": {
    "name": "sint_res",
    "structName": "glue_msg_sampling_init_res",
    "className": "GlueMsgSamplingInitRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "gvoc_req": {
    "name": "gvoc_req",
    "structName": "glue_msg_get_vocab_req",
    "className": "GlueMsgGetVocabReq",
    "fields": []
  },
  "gvoc_res": {
    "name": "gvoc_res",
    "structName": "glue_msg_get_vocab_res",
    "className": "GlueMsgGetVocabRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "vocab",
        "isNullable": false
      }
    ]
  },
  "lkup_req": {
    "name": "lkup_req",
    "structName": "glue_msg_lookup_token_req",
    "className": "GlueMsgLookupTokenReq",
    "fields": [
      {
        "type": "str",
        "name": "piece",
        "isNullable": false
      }
    ]
  },
  "lkup_res": {
    "name": "lkup_res",
    "structName": "glue_msg_lookup_token_res",
    "className": "GlueMsgLookupTokenRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token",
        "isNullable": false
      }
    ]
  },
  "tokn_req": {
    "name": "tokn_req",
    "structName": "glue_msg_tokenize_req",
    "className": "GlueMsgTokenizeReq",
    "fields": [
      {
        "type": "str",
        "name": "text",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "special",
        "isNullable": false
      }
    ]
  },
  "tokn_res": {
    "name": "tokn_res",
    "structName": "glue_msg_tokenize_res",
    "className": "GlueMsgTokenizeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "dtkn_req": {
    "name": "dtkn_req",
    "structName": "glue_msg_detokenize_req",
    "className": "GlueMsgDetokenizeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "dtkn_res": {
    "name": "dtkn_res",
    "structName": "glue_msg_detokenize_res",
    "className": "GlueMsgDetokenizeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "buffer",
        "isNullable": false
      }
    ]
  },
  "deco_req": {
    "name": "deco_req",
    "structName": "glue_msg_decode_req",
    "className": "GlueMsgDecodeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "skip_logits",
        "isNullable": false
      }
    ]
  },
  "deco_res": {
    "name": "deco_res",
    "structName": "glue_msg_decode_res",
    "className": "GlueMsgDecodeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      }
    ]
  },
  "enco_req": {
    "name": "enco_req",
    "structName": "glue_msg_encode_req",
    "className": "GlueMsgEncodeReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "enco_res": {
    "name": "enco_res",
    "structName": "glue_msg_encode_res",
    "className": "GlueMsgEncodeRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      }
    ]
  },
  "ssam_req": {
    "name": "ssam_req",
    "structName": "glue_msg_sampling_sample_req",
    "className": "GlueMsgSamplingSampleReq",
    "fields": []
  },
  "ssam_res": {
    "name": "ssam_res",
    "structName": "glue_msg_sampling_sample_res",
    "className": "GlueMsgSamplingSampleRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "raw",
        "name": "piece",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token",
        "isNullable": false
      }
    ]
  },
  "sacc_req": {
    "name": "sacc_req",
    "structName": "glue_msg_sampling_accept_req",
    "className": "GlueMsgSamplingAcceptReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sacc_res": {
    "name": "sacc_res",
    "structName": "glue_msg_sampling_accept_res",
    "className": "GlueMsgSamplingAcceptRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "glog_req": {
    "name": "glog_req",
    "structName": "glue_msg_get_logits_req",
    "className": "GlueMsgGetLogitsReq",
    "fields": [
      {
        "type": "int",
        "name": "top_k",
        "isNullable": false
      }
    ]
  },
  "glog_res": {
    "name": "glog_res",
    "structName": "glue_msg_get_logits_res",
    "className": "GlueMsgGetLogitsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      },
      {
        "type": "arr_float",
        "name": "probs",
        "isNullable": false
      }
    ]
  },
  "gemb_req": {
    "name": "gemb_req",
    "structName": "glue_msg_get_embeddings_req",
    "className": "GlueMsgGetEmbeddingsReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "gemb_res": {
    "name": "gemb_res",
    "structName": "glue_msg_get_embeddings_res",
    "className": "GlueMsgGetEmbeddingsRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "arr_float",
        "name": "embeddings",
        "isNullable": false
      }
    ]
  },
  "kvcr_req": {
    "name": "kvcr_req",
    "structName": "glue_msg_get_kv_remove_req",
    "className": "GlueMsgGetKvRemoveReq",
    "fields": [
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_discard",
        "isNullable": false
      }
    ]
  },
  "kvcr_res": {
    "name": "kvcr_res",
    "structName": "glue_msg_get_kv_remove_res",
    "className": "GlueMsgGetKvRemoveRes",
    "fields": [
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "kvcc_req": {
    "name": "kvcc_req",
    "structName": "glue_msg_get_kv_clear_req",
    "className": "GlueMsgGetKvClearReq",
    "fields": []
  },
  "kvcc_res": {
    "name": "kvcc_res",
    "structName": "glue_msg_get_kv_clear_res",
    "className": "GlueMsgGetKvClearRes",
    "fields": [
      {
        "type": "int",
        "name": "n_past",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "sesa_req": {
    "name": "sesa_req",
    "structName": "glue_msg_session_save_req",
    "className": "GlueMsgSessionSaveReq",
    "fields": [
      {
        "type": "str",
        "name": "session_path",
        "isNullable": false
      }
    ]
  },
  "sesa_res": {
    "name": "sesa_res",
    "structName": "glue_msg_session_save_res",
    "className": "GlueMsgSessionSaveRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sesl_req": {
    "name": "sesl_req",
    "structName": "glue_msg_session_load_req",
    "className": "GlueMsgSessionLoadReq",
    "fields": [
      {
        "type": "str",
        "name": "session_path",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "sesl_res": {
    "name": "sesl_res",
    "structName": "glue_msg_session_load_res",
    "className": "GlueMsgSessionLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "stat_req": {
    "name": "stat_req",
    "structName": "glue_msg_status_req",
    "className": "GlueMsgStatusReq",
    "fields": []
  },
  "stat_res": {
    "name": "stat_res",
    "structName": "glue_msg_status_res",
    "className": "GlueMsgStatusRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "pctx_req": {
    "name": "pctx_req",
    "structName": "glue_msg_perf_context_req",
    "className": "GlueMsgPerfContextReq",
    "fields": []
  },
  "pctx_res": {
    "name": "pctx_res",
    "structName": "glue_msg_perf_context_res",
    "className": "GlueMsgPerfContextRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "t_start_ms",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "t_load_ms",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "t_p_eval_ms",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "t_eval_ms",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_p_eval",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_eval",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_reused",
        "isNullable": false
      }
    ]
  },
  "prst_req": {
    "name": "prst_req",
    "structName": "glue_msg_perf_reset_req",
    "className": "GlueMsgPerfResetReq",
    "fields": []
  },
  "prst_res": {
    "name": "prst_res",
    "structName": "glue_msg_perf_reset_res",
    "className": "GlueMsgPerfResetRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "tben_req": {
    "name": "tben_req",
    "structName": "glue_msg_test_benchmark_req",
    "className": "GlueMsgTestBenchmarkReq",
    "fields": [
      {
        "type": "str",
        "name": "type",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_samples",
        "isNullable": false
      }
    ]
  },
  "tben_res": {
    "name": "tben_res",
    "structName": "glue_msg_test_benchmark_res",
    "className": "GlueMsgTestBenchmarkRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "t_ms",
        "isNullable": false
      }
    ]
  },
  "tper_req": {
    "name": "tper_req",
    "structName": "glue_msg_test_perplexity_req",
    "className": "GlueMsgTestPerplexityReq",
    "fields": [
      {
        "type": "arr_int",
        "name": "tokens",
        "isNullable": false
      }
    ]
  },
  "tper_res": {
    "name": "tper_res",
    "structName": "glue_msg_test_perplexity_res",
    "className": "GlueMsgTestPerplexityRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "ppl",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "nll",
        "isNullable": false
      },
      {
        "type": "float",
        "name": "cross_entropy",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_tokens",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "t_ms",
        "isNullable": false
      }
    ]
  },
  "cfmt_req": {
    "name": "cfmt_req",
    "structName": "glue_msg_chat_format_req",
    "className": "GlueMsgChatFormatReq",
    "fields": [
      {
        "type": "str",
        "name": "tmpl",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "add_ass",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "roles",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "contents",
        "isNullable": false
      }
    ]
  },
  "cfmt_res": {
    "name": "cfmt_res",
    "structName": "glue_msg_chat_format_res",
    "className": "GlueMsgChatFormatRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "formatted_chat",
        "isNullable": false
      }
    ]
  }
};

// src/glue/glue.ts
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen ?? readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}

// src/utils.ts
var joinBuffers = (buffers) => {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const output = new Uint8Array(totalSize);
  output.set(buffers[0], 0);
  for (let i = 1; i < buffers.length; i++) {
    output.set(buffers[i], buffers[i - 1].length);
  }
  return output;
};
var textDecoder = new TextDecoder();
var bufToText = (buffer) => {
  return textDecoder.decode(buffer);
};
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var absoluteUrl = (relativePath) => new URL(relativePath, document.baseURI).href;
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!value?.startsWith;
var isSupportMultiThread = () => (async (e) => {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
})(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportMemory64 = async () => {
  try {
    const descriptor = {
      initial: 1n,
      maximum: 1n,
      address: "i64"
    };
    new WebAssembly.Memory(descriptor);
    return true;
  } catch (e) {
    return false;
  }
};
var isSupportExceptions = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    10,
    8,
    1,
    6,
    0,
    6,
    64,
    25,
    11,
    11
  ])
);
var isSupportSIMD = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    5,
    1,
    96,
    0,
    1,
    123,
    3,
    2,
    1,
    0,
    10,
    10,
    1,
    8,
    0,
    65,
    0,
    253,
    15,
    253,
    98,
    11
  ])
);
var checkEnvironmentCompatible = async () => {
  if (!await isSupportExceptions()) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!await isSupportSIMD()) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
};
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  values.push(
    new Promise((r) => {
      resolve = r;
    })
  );
  fn(...args, (val, done) => {
    resolve([val, done]);
    values.push(
      new Promise((r) => {
        resolve = r;
      })
    );
  });
  return (async function* () {
    let val;
    for (let i = 0, done = false; !done; i++) {
      [val, done] = await values[i];
      delete values[i];
      if (val !== void 0) yield val;
    }
  })();
};

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b1-5ec717d";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\n\nlet Module = null;\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\nconst toUintPtr = (ptr) => ptr >>> 0;\nconst isMemory64 = () => !!RUN_OPTIONS.pathConfig['wllama.memory64'];\nconst ptrToHeapOffset = (ptr) => (isMemory64() ? Number(ptr) : toUintPtr(ptr));\nconst sizeToWasm = (size) => (isMemory64() ? BigInt(size) : size);\nconst ptrToJsNumber = (value) =>\n  typeof value === 'bigint' ? Number(value) : value;\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: argMainScriptBlob,\n    pthreadPoolSize,\n    wasmMemory: pthreadPoolSize > 1 ? getWasmMemory() : null,\n    onAbort: function (text) {\n      msg({ verb: 'signal.abort', args: [text] });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Because we have a weird OOM issue on iOS, we need to try some values\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  let minBytes = 128 * 1024 * 1024;\n  let maxBytes = 4096 * 1024 * 1024;\n  let stepBytes = 128 * 1024 * 1024;\n  while (maxBytes > minBytes) {\n    try {\n      const wasmMemory = new WebAssembly.Memory({\n        initial: minBytes / 65536,\n        maximum: maxBytes / 65536,\n        shared: true,\n      });\n      return wasmMemory;\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory');\n};\n\n//////////////////////////////////////////////////////////////\n// MEMFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n *\n * Note 29/05/2024 @ngxson\n * Due to ftell() being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes (or 2GB)\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/system/lib/libc/musl/src/stdio/ftell.c\n *\n * For WebGPU, we want to extend this idea one level further to\n * avoid hitting memory limits, especially on mobile devices.\n * Download models directly to disk via OPFS, avoiding the WASM\n * heap to prevent growing the heap and having an extra copy of the model.\n * Then, stream it from disk directly to llama.cpp. We still need to\n * support async tensor uploads in llama.cpp WebGPU backend, which should\n * decrease memory usage even further.\n *\n * Note that the model cache manager is already backed by OPFS.\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\nconst opfsHandles = {}; // map Name => { synchandle, size } for OPFS-backed files\n\n// Patch and redirect memfs calls to wllama\nconst patchMEMFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const heapOffset = ptrToHeapOffset(f.ptr);\n      stream.node.contents = m.HEAPU8.subarray(heapOffset, heapOffset + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    const name = stream.node.name;\n    // OPFS-backed path for WebGPU\n    if (opfsHandles[name]) {\n      const { syncHandle, size } = opfsHandles[name];\n      const toRead = Math.min(length, size - position);\n      if (toRead <= 0) return 0;\n      const view = new Uint8Array(\n        buffer.buffer,\n        buffer.byteOffset + offset,\n        toRead\n      );\n      return syncHandle.read(view, { at: position });\n    }\n    // WASM heap-backed path for WASM\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    const name = stream.node.name;\n    // OPFS-backed path for WebGPU\n    if (opfsHandles[name]) {\n      const { size } = opfsHandles[name];\n      let newPos = offset;\n      if (whence === 1) newPos += stream.position; // SEEK_CUR\n      if (whence === 2) newPos += size; // SEEK_END\n      if (newPos < 0) throw new Error('SEEK before start of file');\n      stream.position = newPos;\n      return newPos;\n    }\n    // WASM heap-backed path for WASM\n    patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    const name = stream.node.name;\n    if (opfsHandles[name]) {\n      // OPFS-backed files must never be mmap'd \u2014 that would copy the entire model\n      // onto the WASM heap, defeating the whole point of the OPFS path.\n      // use_mmap=false is set in wllama.ts for WebGPU loads, so llama.cpp should\n      // never reach this branch. If it does, throw immediately so the bug is visible.\n      console.error(\n        `[OPFS] mmap called on OPFS-backed file \"${name}\" (length=${length}, position=${position}). This should never happen when use_mmap=false is set. Please report this as a bug.`\n      );\n      throw new Error(\n        `[wllama] mmap called on OPFS-backed file \"${name}\". ` +\n          `This should never happen when use_mmap=false is set. ` +\n          `Please report this as a bug.`\n      );\n    }\n\n    patchStream(stream);\n\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      return {\n        ptr: ptrToHeapOffset(f.ptr) + ptrToJsNumber(position),\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  const ptr = m.mmapAlloc(ptrToJsNumber(size));\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  const m = Module;\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const heapOffset = ptrToHeapOffset(ptr);\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    m.HEAPU8.set(buffer, heapOffset + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\nconst opfsAlloc = async (logicalName, opfsCacheFileName) => {\n  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';\n  console.log(`[OPFS] opfsAlloc: logicalName=\"${logicalName}\" \n    opfsCacheFileName=\"${opfsCacheFileName}\"`);\n\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache');\n  const fileHandle = await cacheDir.getFileHandle(opfsCacheFileName);\n  const syncHandle = await fileHandle.createSyncAccessHandle();\n  const size = syncHandle.getSize();\n  opfsHandles[logicalName] = { syncHandle, size };\n\n  // Create a handle in MEMfs so Emscripten can refer to the file\n  Module['FS_createDataFile'](\n    '/models',\n    logicalName,\n    new Uint8Array(0),\n    true,\n    true,\n    true\n  );\n  // Set usedBytes so fstat() returns the real file size.\n  Module.FS.lookupPath('/models/' + logicalName).node.usedBytes = size;\n  console.log(\n    `[OPFS] opfsAlloc: created MEMFS placeholder at /models/${logicalName} with usedBytes=${size}`\n  );\n\n  return size;\n};\n\nconst opfsFreeAll = () => {\n  const names = Object.keys(opfsHandles);\n  for (const [name, { syncHandle }] of Object.entries(opfsHandles)) {\n    try {\n      syncHandle.close();\n      Module.FS.unlink('/models/' + name);\n    } catch (e) {\n      console.warn('[OPFS] Error freeing ' + name + ': ' + e);\n    }\n    delete opfsHandles[name];\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst callWrapper = (name, ret, args, isAsync) => {\n  const fn = Module.cwrap(\n    name,\n    ret,\n    args,\n    isAsync ? { async: true } : undefined\n  );\n  return async (...callArgs) => {\n    let result;\n    try {\n      result = isAsync ? await fn(...callArgs) : fn(...callArgs);\n    } catch (ex) {\n      console.error(ex);\n      throw ex;\n    }\n    return result;\n  };\n};\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    try {\n      Module = getWModuleConfig(argMainScriptBlob);\n      Module.onRuntimeInitialized = () => {\n        // async call once module is ready\n        // init FS\n        patchMEMFS();\n        // init cwrap\n        const pointer = isMemory64() ? 'bigint' : 'number';\n        const sizeArg = isMemory64() ? 'bigint' : 'number';\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\n        wllamaMalloc = callWrapper(\n          'wllama_malloc',\n          pointer,\n          [sizeArg, 'number'],\n          false\n        );\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\n        wllamaAction = callWrapper(\n          'wllama_action',\n          pointer,\n          ['string', pointer],\n          true\n        );\n        wllamaExit = callWrapper('wllama_exit', 'string', [], false);\n        wllamaDebug = callWrapper('wllama_debug', 'string', [], false);\n        msg({ callbackId, result: null });\n      };\n      wModuleInit();\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    try {\n      // create blank file\n      const emptyBuffer = new Uint8Array(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.opfs-alloc') {\n    const argLogicalName = args[0];\n    const argOpfsCacheFileName = args[1];\n    try {\n      const size = await opfsAlloc(argLogicalName, argOpfsCacheFileName);\n      msg({ callbackId, result: { size } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    try {\n      const result = await wllamaStart();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    const argAction = args[0];\n    const argEncodedMsg = args[1];\n    try {\n      const inputPtr = await wllamaMalloc(\n        sizeToWasm(argEncodedMsg.byteLength),\n        0\n      );\n      const inputHeapOffset = ptrToHeapOffset(inputPtr);\n      // copy data to wasm heap\n      const inputBuffer = new Uint8Array(\n        Module.HEAPU8.buffer,\n        inputHeapOffset,\n        argEncodedMsg.byteLength\n      );\n      inputBuffer.set(argEncodedMsg, 0);\n      const outputPtr = await wllamaAction(argAction, inputPtr);\n      // length of output buffer is written at the first 4 bytes of input buffer\n      const outputLen = new Uint32Array(\n        Module.HEAPU8.buffer,\n        inputHeapOffset,\n        1\n      )[0];\n      // copy the output buffer to JS heap\n      const outputBuffer = new Uint8Array(outputLen);\n      const outputHeapOffset = ptrToHeapOffset(outputPtr);\n      const outputSrcView = new Uint8Array(\n        Module.HEAPU8.buffer,\n        outputHeapOffset,\n        outputLen\n      );\n      outputBuffer.set(outputSrcView, 0); // copy it\n\n      // After the model is loaded into WebGPU buffers, we can delete\n      // the OPFS copy.\n      const useWebGPU = RUN_OPTIONS.pathConfig['wllama.useWebGPU'];\n      if (argAction === 'load' && useWebGPU) {\n        opfsFreeAll();\n      }\n      msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    try {\n      const result = await wllamaExit();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    try {\n      const result = await wllamaDebug();\n      msg({ callbackId, result });\n    } catch (err) {\n      msg({ callbackId, err });\n    }\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet abortController = new AbortController();\n\nasync function openFile(filename) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(0); // clear file content\n}\n\nasync function writeFile(buf) {\n  accessHandle.write(buf);\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string' }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const { action, filename, buf, url, options, metadataFileName } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WLLAMA_JSPI_SINGLE_THREAD_CODE = 'var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var arguments_=[];var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!="undefined"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require("fs");scriptDirectory=__dirname+"/";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,"/")}arguments_=process.argv.slice(2);if(typeof module!="undefined"){module["exports"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href}catch{}{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)}}}else{}var out=console.log.bind(console);var err=console.error.bind(console);var wasmBinary;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort(text)}}var isFileURI=filename=>filename.startsWith("file://");var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;var HEAP64,HEAPU64;var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b)}function initMemory(){if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"]}else{var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||134217728;wasmMemory=new WebAssembly.Memory({initial:BigInt(INITIAL_MEMORY/65536),maximum:65536n,address:"i64"})}updateMemoryViews()}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}function preMain(){}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";if(runtimeInitialized){___trap()}var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("wllama.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){Asyncify.instrumentWasmImports(wasmImports);var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);wasmExports=applySignatureConversions(wasmExports);assignWasmExports(wasmExports);removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){return receiveInstance(result["instance"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{Module["instantiateWasm"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})})}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var removeRunDependency=id=>{runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module["monitorRunDependencies"]?.(runDependencies)};var noExitRuntime=true;var wasmMemory;var syscallGetVarargP=()=>{var ret=Number(HEAPU64[SYSCALLS.varargs/8]);SYSCALLS.varargs+=8;return ret};var syscallGetVarargI=()=>{var ret=HEAP32[+SYSCALLS.varargs/4];SYSCALLS.varargs+=4;return ret};var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>view=>crypto.getRandomValues(view);var randomFill=view=>{(randomFill=initRandomFill())(view)};var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8")}}else if(globalThis.window?.prompt){result=window.prompt("Input: ");if(result!==null){result+="\\n"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>HEAPU8.fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0}else{var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)))}node.usedBytes=newSize}},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){if(!MEMFS.doesNotExistError){MEMFS.doesNotExistError=new FS.ErrnoError(44);MEMFS.doesNotExistError.stack="<generic error, no stack>"}throw MEMFS.doesNotExistError},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset)}else{for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i]}return size},write(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===HEAP8.buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position)}else{for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i]}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents&&contents.buffer===HEAP8.buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}HEAP8.set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>id;var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!="undefined")Browser.init();for(var plugin of preloadPlugins){if(plugin["canHandle"](fullname)){return plugin["handle"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url=="string"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name="ErrnoError";constructor(errno){this.errno=errno}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}else if(perms.includes("w")&&!(node.mode&146)){return 2}else if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else{if(FS.isDir(node.mode)){return 31}}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=typeof flags=="string"?FS_modeStringToFlags(flags):flags;if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path=="object"){node=path}else{isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}if(Module["logReadFiles"]&&!(flags&1)){if(!(path in FS.readFiles)){FS.readFiles[path]=1}}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){abort(`Invalid encoding type "${opts.encoding}"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data=="string"){data=new Uint8Array(intArrayFromString(data,true))}if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn)}else{abort("Unsupported data type")}FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user")},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp")},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd")},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input)}else{FS.symlink("/dev/tty","/dev/stdin")}if(output){FS.createDevice("/dev","stdout",null,output)}else{FS.symlink("/dev/tty","/dev/stdout")}if(error){FS.createDevice("/dev","stderr",null,error)}else{FS.symlink("/dev/tty1","/dev/stderr")}var stdin=FS.open("/dev/stdin",0);var stdout=FS.open("/dev/stdout",1);var stderr=FS.open("/dev/stderr",1)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data=="string"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)abort("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]=="undefined")abort("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,HEAP8,ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead,ignoreNul):"";var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){HEAPU32[buf/4]=stat.dev;HEAPU32[(buf+4)/4]=stat.mode;HEAPU64[(buf+8)/8]=BigInt(stat.nlink);HEAPU32[(buf+16)/4]=stat.uid;HEAPU32[(buf+20)/4]=stat.gid;HEAPU32[(buf+24)/4]=stat.rdev;HEAP64[(buf+32)/8]=BigInt(stat.size);HEAP32[(buf+40)/4]=4096;HEAP32[(buf+44)/4]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();HEAP64[(buf+48)/8]=BigInt(Math.floor(atime/1e3));HEAPU64[(buf+56)/8]=BigInt(atime%1e3*1e3*1e3);HEAP64[(buf+64)/8]=BigInt(Math.floor(mtime/1e3));HEAPU64[(buf+72)/8]=BigInt(mtime%1e3*1e3*1e3);HEAP64[(buf+80)/8]=BigInt(Math.floor(ctime/1e3));HEAPU64[(buf+88)/8]=BigInt(ctime%1e3*1e3*1e3);HEAP64[(buf+96)/8]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){HEAPU32[(buf+8)/4]=stats.bsize;HEAPU32[(buf+72)/4]=stats.bsize;HEAP64[(buf+16)/8]=BigInt(stats.blocks);HEAP64[(buf+24)/8]=BigInt(stats.bfree);HEAP64[(buf+32)/8]=BigInt(stats.bavail);HEAP64[(buf+40)/8]=BigInt(stats.files);HEAP64[(buf+48)/8]=BigInt(stats.ffree);HEAPU32[(buf+56)/4]=stats.fsid;HEAPU32[(buf+80)/4]=stats.flags;HEAPU32[(buf+64)/4]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=HEAPU8.slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function ___syscall_fcntl64(fd,cmd,varargs){varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 5:{var arg=syscallGetVarargP();var offset=0;HEAP16[(arg+offset)/2]=2;return 0}case 6:case 7:return 0}return-28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite);function ___syscall_getcwd(buf,size){buf=bigintToI53Checked(buf);size=bigintToI53Checked(size);try{if(size===0)return-28;var cwd=FS.cwd();var cwdLengthInBytes=lengthBytesUTF8(cwd)+1;if(size<cwdLengthInBytes)return-68;stringToUTF8(cwd,buf,size);return cwdLengthInBytes}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_getdents64(fd,dirp,count){dirp=bigintToI53Checked(dirp);count=bigintToI53Checked(count);try{var stream=SYSCALLS.getStreamFromFD(fd);stream.getdents||=FS.readdir(stream.path);var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var startIdx=Math.floor(off/struct_size);var endIdx=Math.min(stream.getdents.length,startIdx+Math.floor(count/struct_size));for(var idx=startIdx;idx<endIdx;idx++){var id;var type;var name=stream.getdents[idx];if(name==="."){id=stream.node.id;type=4}else if(name===".."){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4}else{var child;try{child=FS.lookupNode(stream.node,name)}catch(e){if(e?.errno===28){continue}throw e}id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8}HEAP64[(dirp+pos)/8]=BigInt(id);HEAP64[(dirp+pos+8)/8]=BigInt((idx+1)*struct_size);HEAP16[(dirp+pos+16)/2]=280;HEAP8[dirp+pos+18]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();HEAP32[argp/4]=termios.c_iflag||0;HEAP32[(argp+4)/4]=termios.c_oflag||0;HEAP32[(argp+8)/4]=termios.c_cflag||0;HEAP32[(argp+12)/4]=termios.c_lflag||0;for(var i=0;i<32;i++){HEAP8[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=HEAP32[argp/4];var c_oflag=HEAP32[(argp+4)/4];var c_cflag=HEAP32[(argp+8)/4];var c_lflag=HEAP32[(argp+12)/4];var c_cc=[];for(var i=0;i<32;i++){c_cc.push(HEAP8[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();HEAP32[argp/4]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();HEAP16[argp/2]=winsize[0];HEAP16[(argp+2)/2]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){path=bigintToI53Checked(path);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_stat64(path,buf){path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __abort_js=()=>abort("");var runtimeKeepaliveCounter=0;var __emscripten_runtime_keepalive_clear=()=>{noExitRuntime=false;runtimeKeepaliveCounter=0};function __mmap_js(len,prot,flags,fd,offset,allocated,addr){len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);allocated=bigintToI53Checked(allocated);addr=bigintToI53Checked(addr);try{var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;HEAP32[allocated/4]=res.allocated;HEAPU64[addr/8]=BigInt(ptr);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){addr=bigintToI53Checked(addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var timers={};var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}quit_(1,e)};var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var _proc_exit=code=>{EXITSTATUS=code;if(!keepRuntimeAlive()){Module["onExit"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))};var exitJS=(status,implicit)=>{EXITSTATUS=status;_proc_exit(status)};var _exit=exitJS;var maybeExit=()=>{if(!keepRuntimeAlive()){try{_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){return}try{func();maybeExit()}catch(e){handleException(e)}};var _emscripten_get_now=()=>performance.now();var __setitimer_js=(which,timeout_ms)=>{if(timers[which]){clearTimeout(timers[which].id);delete timers[which]}if(!timeout_ms)return 0;var id=setTimeout(()=>{delete timers[which];callUserCallback(()=>__emscripten_timeout(which,_emscripten_get_now()))},timeout_ms);timers[which]={id,timeout_ms};return 0};var __tzset_js=function(timezone,daylight,std_name,dst_name){timezone=bigintToI53Checked(timezone);daylight=bigintToI53Checked(daylight);std_name=bigintToI53Checked(std_name);dst_name=bigintToI53Checked(dst_name);var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);HEAPU64[timezone/8]=BigInt(stdTimezoneOffset*60);HEAP32[daylight/4]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);ptime=bigintToI53Checked(ptime);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);HEAP64[ptime/8]=BigInt(nsec);return 0}var getHeapMax=()=>4294967296;var _emscripten_get_heap_max=()=>BigInt(getHeapMax());var _emscripten_has_asyncify=()=>2;var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(BigInt(pages));updateMemoryViews();return 1}catch(e){}};function _emscripten_resize_heap(requestedSize){requestedSize=bigintToI53Checked(requestedSize);var oldSize=HEAPU8.length;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false}var stackSave=()=>_emscripten_stack_get_current();var stackRestore=val=>__emscripten_stack_restore(val);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var writeI53ToI64=(ptr,num)=>{HEAPU32[ptr/4]=num;var lower=HEAPU32[ptr/4];HEAPU32[(ptr+4)/4]=(num-lower)/4294967296};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var readI53FromI64=ptr=>HEAPU32[ptr/4]+HEAP32[(ptr+4)/4]*4294967296;var wasmTableMirror=[];var getWasmTableEntry=funcPtr=>{funcPtr=Number(funcPtr);var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(BigInt(funcPtr));if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState==="unmapped");var bufferPtr=_emwgpuCreateBuffer(parentPtr);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsExternalTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateExternalTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>getWasmTableEntry(callback).call(null,a1,BigInt(a2),BigInt(a3)))(type,BigInt(messagePtr),userdata);stackRestore(sp)},iterateExtensions:(root,handlers)=>{for(var ptr=Number(HEAPU64[root/8]);ptr;ptr=Number(HEAPU64[ptr/8])){var sType=HEAP32[(ptr+8)/4];var handler=handlers[sType](ptr)}},setStringView:(ptr,data,length)=>{HEAPU64[ptr/8]=BigInt(data);HEAPU64[(ptr+8)/8]=BigInt(length)},makeStringFromStringView:stringViewPtr=>{var ptr=Number(HEAPU64[stringViewPtr/8]);var length=Number(HEAPU64[(stringViewPtr+8)/8]);return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=Number(HEAPU64[stringViewPtr/8]);var length=Number(HEAPU64[(stringViewPtr+8)/8]);if(!ptr){if(length===0){return""}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:HEAPF64[ptr/8],g:HEAPF64[(ptr+8)/8],b:HEAPF64[(ptr+16)/8],a:HEAPF64[(ptr+24)/8]}),makeExtent3D:ptr=>({width:HEAPU32[ptr/4],height:HEAPU32[(ptr+4)/4],depthOrArrayLayers:HEAPU32[(ptr+8)/4]}),makeOrigin3D:ptr=>({x:HEAPU32[ptr/4],y:HEAPU32[(ptr+4)/4],z:HEAPU32[(ptr+8)/4]}),makeTexelCopyTextureInfo:ptr=>({texture:WebGPU.getJsObject(Number(HEAPU64[ptr/8])),mipLevel:HEAPU32[(ptr+8)/4],origin:WebGPU.makeOrigin3D(ptr+12),aspect:WebGPU.TextureAspect[HEAP32[(ptr+24)/4]]}),makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=HEAPU32[(ptr+8)/4];var rowsPerImage=HEAPU32[(ptr+12)/4];return{offset:readI53FromI64(ptr),bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView["buffer"]=WebGPU.getJsObject(Number(HEAPU64[(ptr+16)/8]));return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject(Number(HEAPU64[(ptr+8)/8])),beginningOfPassWriteIndex:HEAPU32[(ptr+16)/4],endOfPassWriteIndex:HEAPU32[(ptr+20)/4]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+32*i;var key=WebGPU.makeStringFromStringView(entryPtr+8);constants[key]=HEAPF64[(entryPtr+24)/8]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return"auto";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;var desc={module:WebGPU.getJsObject(Number(HEAPU64[(ptr+8)/8])),constants:WebGPU.makePipelineConstants(Number(HEAPU64[(ptr+32)/8]),Number(HEAPU64[(ptr+40)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+16)};return desc},makeComputePipelineDesc:descriptor=>{var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number(HEAPU64[(descriptor+24)/8])),compute:WebGPU.makeComputeState(descriptor+32)};return desc},makeRenderPipelineDesc:descriptor=>{function makePrimitiveState(psPtr){if(!psPtr)return undefined;return{topology:WebGPU.PrimitiveTopology[HEAP32[(psPtr+8)/4]],stripIndexFormat:WebGPU.IndexFormat[HEAP32[(psPtr+12)/4]],frontFace:WebGPU.FrontFace[HEAP32[(psPtr+16)/4]],cullMode:WebGPU.CullMode[HEAP32[(psPtr+20)/4]],unclippedDepth:!!HEAPU32[(psPtr+24)/4]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[HEAP32[bdPtr/4]],srcFactor:WebGPU.BlendFactor[HEAP32[(bdPtr+4)/4]],dstFactor:WebGPU.BlendFactor[HEAP32[(bdPtr+8)/4]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){var format=WebGPU.TextureFormat[HEAP32[(csPtr+8)/4]];return format?{format,blend:makeBlendState(Number(HEAPU64[(csPtr+16)/8])),writeMask:HEAPU32[(csPtr+24)/4]}:undefined}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+32*i))}return states}function makeStencilStateFace(ssfPtr){return{compare:WebGPU.CompareFunction[HEAP32[ssfPtr/4]],failOp:WebGPU.StencilOperation[HEAP32[(ssfPtr+4)/4]],depthFailOp:WebGPU.StencilOperation[HEAP32[(ssfPtr+8)/4]],passOp:WebGPU.StencilOperation[HEAP32[(ssfPtr+12)/4]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;return{format:WebGPU.TextureFormat[HEAP32[(dssPtr+8)/4]],depthWriteEnabled:!!HEAPU32[(dssPtr+12)/4],depthCompare:WebGPU.CompareFunction[HEAP32[(dssPtr+16)/4]],stencilFront:makeStencilStateFace(dssPtr+20),stencilBack:makeStencilStateFace(dssPtr+36),stencilReadMask:HEAPU32[(dssPtr+52)/4],stencilWriteMask:HEAPU32[(dssPtr+56)/4],depthBias:HEAP32[(dssPtr+60)/4],depthBiasSlopeScale:HEAPF32[(dssPtr+64)/4],depthBiasClamp:HEAPF32[(dssPtr+68)/4]}}function makeVertexAttribute(vaPtr){return{format:WebGPU.VertexFormat[HEAP32[(vaPtr+8)/4]],offset:readI53FromI64(vaPtr+16),shaderLocation:HEAPU32[(vaPtr+24)/4]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*32))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepMode=WebGPU.VertexStepMode[HEAP32[(vbPtr+8)/4]];var attributeCount=Number(HEAPU64[(vbPtr+24)/8]);if(!stepMode&&!attributeCount){return null}return{arrayStride:readI53FromI64(vbPtr+16),stepMode,attributes:makeVertexAttributes(attributeCount,Number(HEAPU64[(vbPtr+32)/8]))}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*40))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;var desc={module:WebGPU.getJsObject(Number(HEAPU64[(viPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number(HEAPU64[(viPtr+32)/8]),Number(HEAPU64[(viPtr+40)/8])),buffers:makeVertexBuffers(Number(HEAPU64[(viPtr+48)/8]),Number(HEAPU64[(viPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+16)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;return{count:HEAPU32[(msPtr+8)/4],mask:HEAPU32[(msPtr+12)/4],alphaToCoverageEnabled:!!HEAPU32[(msPtr+16)/4]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;var desc={module:WebGPU.getJsObject(Number(HEAPU64[(fsPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number(HEAPU64[(fsPtr+32)/8]),Number(HEAPU64[(fsPtr+40)/8])),targets:makeColorStates(Number(HEAPU64[(fsPtr+48)/8]),Number(HEAPU64[(fsPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+16)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number(HEAPU64[(descriptor+24)/8])),vertex:makeVertexState(descriptor+32),primitive:makePrimitiveState(descriptor+96),depthStencil:makeDepthStencilState(Number(HEAPU64[(descriptor+128)/8])),multisample:makeMultisampleState(descriptor+136),fragment:makeFragmentState(Number(HEAPU64[(descriptor+160)/8]))};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{var nextInChainPtr=Number(HEAPU64[limitsOutPtr/8]);function setLimitValueU32(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;HEAPU32[(basePtr+limitOffset)/4]=limitValue}function setLimitValueU64(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;writeI53ToI64(basePtr+limitOffset,limitValue)}setLimitValueU32("maxTextureDimension1D",limitsOutPtr,8);setLimitValueU32("maxTextureDimension2D",limitsOutPtr,12);setLimitValueU32("maxTextureDimension3D",limitsOutPtr,16);setLimitValueU32("maxTextureArrayLayers",limitsOutPtr,20);setLimitValueU32("maxBindGroups",limitsOutPtr,24);setLimitValueU32("maxBindGroupsPlusVertexBuffers",limitsOutPtr,28);setLimitValueU32("maxBindingsPerBindGroup",limitsOutPtr,32);setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout",limitsOutPtr,36);setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout",limitsOutPtr,40);setLimitValueU32("maxSampledTexturesPerShaderStage",limitsOutPtr,44);setLimitValueU32("maxSamplersPerShaderStage",limitsOutPtr,48);setLimitValueU32("maxStorageBuffersPerShaderStage",limitsOutPtr,52);setLimitValueU32("maxStorageTexturesPerShaderStage",limitsOutPtr,56);setLimitValueU32("maxUniformBuffersPerShaderStage",limitsOutPtr,60);setLimitValueU32("minUniformBufferOffsetAlignment",limitsOutPtr,80);setLimitValueU32("minStorageBufferOffsetAlignment",limitsOutPtr,84);setLimitValueU64("maxUniformBufferBindingSize",limitsOutPtr,64);setLimitValueU64("maxStorageBufferBindingSize",limitsOutPtr,72);setLimitValueU32("maxVertexBuffers",limitsOutPtr,88);setLimitValueU64("maxBufferSize",limitsOutPtr,96);setLimitValueU32("maxVertexAttributes",limitsOutPtr,104);setLimitValueU32("maxVertexBufferArrayStride",limitsOutPtr,108);setLimitValueU32("maxInterStageShaderVariables",limitsOutPtr,112);setLimitValueU32("maxColorAttachments",limitsOutPtr,116);setLimitValueU32("maxColorAttachmentBytesPerSample",limitsOutPtr,120);setLimitValueU32("maxComputeWorkgroupStorageSize",limitsOutPtr,124);setLimitValueU32("maxComputeInvocationsPerWorkgroup",limitsOutPtr,128);setLimitValueU32("maxComputeWorkgroupSizeX",limitsOutPtr,132);setLimitValueU32("maxComputeWorkgroupSizeY",limitsOutPtr,136);setLimitValueU32("maxComputeWorkgroupSizeZ",limitsOutPtr,140);setLimitValueU32("maxComputeWorkgroupsPerDimension",limitsOutPtr,144);setLimitValueU32("maxImmediateSize",limitsOutPtr,148);if(nextInChainPtr!==0){var sType=HEAP32[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;setLimitValueU32("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20,limits.maxStorageTexturesPerShaderStage);setLimitValueU32("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28,limits.maxStorageTexturesPerShaderStage)}},fillAdapterInfoStruct:(info,infoStruct)=>{HEAPU32[(infoStruct+88)/4]=info.subgroupMinSize;HEAPU32[(infoStruct+92)/4]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+8,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+24,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+40,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+56,strPtr,descriptionLen);strPtr+=descriptionLen;HEAP32[(infoStruct+72)/4]=2;var adapterType=info.isFallbackAdapter?3:4;HEAP32[(infoStruct+76)/4]=adapterType;HEAPU32[(infoStruct+80)/4]=0;HEAPU32[(infoStruct+84)/4]=0},AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1-alpha","one-minus-src1-alpha"],BlendOperation:[,"add","subtract","reverse-subtract","min","max"],BufferBindingType:[,,"uniform","storage","read-only-storage"],BufferMapState:[,"unmapped","pending","mapped"],CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],CompilationInfoRequestStatus:[,"success","callback-cancelled"],ComponentSwizzle:[,"0","1","r","g","b","a"],CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],CullMode:[,"none","front","back"],ErrorFilter:[,"validation","out-of-memory","internal"],FeatureLevel:[,"compatibility","core"],FeatureName:{1:"core-features-and-limits",2:"depth-clip-control",3:"depth32float-stencil8",4:"texture-compression-bc",5:"texture-compression-bc-sliced-3d",6:"texture-compression-etc2",7:"texture-compression-astc",8:"texture-compression-astc-sliced-3d",9:"timestamp-query",10:"indirect-first-instance",11:"shader-f16",12:"rg11b10ufloat-renderable",13:"bgra8unorm-storage",14:"float32-filterable",15:"float32-blendable",16:"clip-distances",17:"dual-source-blending",18:"subgroups",19:"texture-formats-tier1",20:"texture-formats-tier2",21:"primitive-index",22:"texture-component-swizzle",327692:"chromium-experimental-unorm16-texture-formats",327729:"chromium-experimental-multi-draw-indirect"},FilterMode:[,"nearest","linear"],FrontFace:[,"ccw","cw"],IndexFormat:[,"uint16","uint32"],InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],LoadOp:[,"load","clear"],MipmapFilterMode:[,"nearest","linear"],OptionalBool:["false","true"],PowerPreference:[,"low-power","high-performance"],PredefinedColorSpace:[,"srgb","display-p3"],PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],QueryType:[,"occlusion","timestamp"],SamplerBindingType:[,,"filtering","non-filtering","comparison"],Status:[,"success","error"],StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],StorageTextureAccess:[,,"write-only","read-only","read-write"],StoreOp:[,"store","discard"],SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],TextureAspect:[,"all","stencil-only","depth-only"],TextureDimension:[,"1d","2d","3d"],TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],TextureSampleType:[,,"float","unfilterable-float","depth","sint","uint"],TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],ToneMappingMode:[,"standard","extended"],VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra"],VertexStepMode:[,"vertex","instance"],WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access","uniform_buffer_standard_layout","subgroup_id","texture_and_sampler_let","subgroup_uniformity","texture_formats_tier1"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){adapterPtr=bigintToI53Checked(adapterPtr);futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);devicePtr=bigintToI53Checked(devicePtr);queuePtr=bigintToI53Checked(queuePtr);descriptor=bigintToI53Checked(descriptor);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){var requiredFeatureCount=Number(HEAPU64[(descriptor+24)/8]);if(requiredFeatureCount){var requiredFeaturesPtr=Number(HEAPU64[(descriptor+32)/8]);desc["requiredFeatures"]=Array.from(HEAPU32.subarray(requiredFeaturesPtr/4,(requiredFeaturesPtr+requiredFeatureCount*4)/4),feature=>WebGPU.FeatureName[feature])}var limitsPtr=Number(HEAPU64[(descriptor+40)/8]);if(limitsPtr){var nextInChainPtr=Number(HEAPU64[limitsPtr/8]);var requiredLimits={};function setLimitU32IfDefined(name,basePtr,limitOffset,ignoreIfZero=false){var ptr=basePtr+limitOffset;var value=HEAPU32[ptr/4];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,basePtr,limitOffset){var ptr=basePtr+limitOffset;var limitPart1=HEAPU32[ptr/4];var limitPart2=HEAPU32[(ptr+4)/4];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=readI53FromI64(ptr)}}setLimitU32IfDefined("maxTextureDimension1D",limitsPtr,8);setLimitU32IfDefined("maxTextureDimension2D",limitsPtr,12);setLimitU32IfDefined("maxTextureDimension3D",limitsPtr,16);setLimitU32IfDefined("maxTextureArrayLayers",limitsPtr,20);setLimitU32IfDefined("maxBindGroups",limitsPtr,24);setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers",limitsPtr,28);setLimitU32IfDefined("maxBindingsPerBindGroup",limitsPtr,32);setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout",limitsPtr,36);setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout",limitsPtr,40);setLimitU32IfDefined("maxSampledTexturesPerShaderStage",limitsPtr,44);setLimitU32IfDefined("maxSamplersPerShaderStage",limitsPtr,48);setLimitU32IfDefined("maxStorageBuffersPerShaderStage",limitsPtr,52);setLimitU32IfDefined("maxStorageTexturesPerShaderStage",limitsPtr,56);setLimitU32IfDefined("maxUniformBuffersPerShaderStage",limitsPtr,60);setLimitU32IfDefined("minUniformBufferOffsetAlignment",limitsPtr,80);setLimitU32IfDefined("minStorageBufferOffsetAlignment",limitsPtr,84);setLimitU64IfDefined("maxUniformBufferBindingSize",limitsPtr,64);setLimitU64IfDefined("maxStorageBufferBindingSize",limitsPtr,72);setLimitU32IfDefined("maxVertexBuffers",limitsPtr,88);setLimitU64IfDefined("maxBufferSize",limitsPtr,96);setLimitU32IfDefined("maxVertexAttributes",limitsPtr,104);setLimitU32IfDefined("maxVertexBufferArrayStride",limitsPtr,108);setLimitU32IfDefined("maxInterStageShaderVariables",limitsPtr,112);setLimitU32IfDefined("maxColorAttachments",limitsPtr,116);setLimitU32IfDefined("maxColorAttachmentBytesPerSample",limitsPtr,120);setLimitU32IfDefined("maxComputeWorkgroupStorageSize",limitsPtr,124);setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",limitsPtr,128);setLimitU32IfDefined("maxComputeWorkgroupSizeX",limitsPtr,132);setLimitU32IfDefined("maxComputeWorkgroupSizeY",limitsPtr,136);setLimitU32IfDefined("maxComputeWorkgroupSizeZ",limitsPtr,140);setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",limitsPtr,144);setLimitU32IfDefined("maxImmediateSize",limitsPtr,148,true);if(nextInChainPtr!==0){var sType=HEAP32[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;if("maxStorageBuffersInVertexStage"in GPUSupportedLimits.prototype){setLimitU32IfDefined("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16);setLimitU32IfDefined("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20);setLimitU32IfDefined("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24);setLimitU32IfDefined("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28)}}desc["requiredLimits"]=requiredLimits}var defaultQueuePtr=Number(HEAPU64[(descriptor+48)/8]);if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+8)};desc["defaultQueue"]=defaultQueueDesc}desc["label"]=WebGPU.makeStringFromOptionalStringView(descriptor+8)}WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);devicePtr=BigInt(devicePtr);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],BigInt(messagePtr));stackRestore(sp)})}));device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(BigInt(devicePtr),type,BigInt(messagePtr));stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,BigInt(devicePtr),0n)})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,BigInt(devicePtr),BigInt(messagePtr));if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,BigInt(messagePtr))}stackRestore(sp)})}))}function _emwgpuBufferDestroy(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()}var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text)}};var _emwgpuBufferGetConstMappedRange=function(bufferPtr,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){return 0n}var data=_memalign(16,mapped.byteLength);HEAPU8.set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data})();return BigInt(ret)};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0n)})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name==="AbortError"?4:ex.name==="OperationError"?3:0;_emwgpuOnMapAsyncCompleted(futureId,status,BigInt(messagePtr));delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};function _emwgpuBufferUnmap(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()}function _emwgpuDelete(ptr){ptr=bigintToI53Checked(ptr);delete WebGPU.Internals.jsObjects[ptr]}function _emwgpuDeviceCreateBuffer(devicePtr,descriptor,bufferPtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);bufferPtr=bigintToI53Checked(bufferPtr);var mappedAtCreation=!!HEAPU32[(descriptor+40)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),usage:HEAPU32[(descriptor+24)/4],size:readI53FromI64(descriptor+32),mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;try{buffer=device.createBuffer(desc)}catch(ex){return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true}function _emwgpuDeviceCreateShaderModule(devicePtr,descriptor,shaderModulePtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);shaderModulePtr=bigintToI53Checked(shaderModulePtr);var nextInChainPtr=Number(HEAPU64[descriptor/8]);var sType=HEAP32[(nextInChainPtr+8)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),code:""};switch(sType){case 2:{desc["code"]=WebGPU.makeStringFromStringView(nextInChainPtr+16);break}}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))}var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){instancePtr=bigintToI53Checked(instancePtr);futureId=bigintToI53Checked(futureId);options=bigintToI53Checked(options);adapterPtr=bigintToI53Checked(adapterPtr);var opts;if(options){opts={featureLevel:WebGPU.FeatureLevel[HEAP32[(options+8)/4]],powerPreference:WebGPU.PowerPreference[HEAP32[(options+12)/4]],forceFallbackAdapter:!!HEAPU32[(options+16)/4]};var nextInChainPtr=Number(HEAPU64[options/8]);if(nextInChainPtr!==0){var sType=HEAP32[(nextInChainPtr+8)/4];var webxrOptions=nextInChainPtr;opts.xrCompatible=!!HEAPU32[(webxrOptions+16)/4]}}if(!("gpu"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp);return}WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,BigInt(adapterPtr),0n)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)}})},ex=>{callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){queuePtr=bigintToI53Checked(queuePtr);futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=function(futurePtr,futureCount,timeoutMSPtr){futurePtr=bigintToI53Checked(futurePtr);futureCount=bigintToI53Checked(futureCount);timeoutMSPtr=bigintToI53Checked(timeoutMSPtr);return Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=HEAP32[timeoutMSPtr/4];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=readI53FromI64(futurePtr+i*8);if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture})};_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(typeof navigator=="object"&&navigator.language||"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};function _environ_get(__environ,environ_buf){__environ=bigintToI53Checked(__environ);environ_buf=bigintToI53Checked(environ_buf);var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;HEAPU64[(__environ+envp)/8]=BigInt(ptr);bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=8}return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){penviron_count=bigintToI53Checked(penviron_count);penviron_buf_size=bigintToI53Checked(penviron_buf_size);var strings=getEnvStrings();HEAPU64[penviron_count/8]=BigInt(strings.length);var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}HEAPU64[penviron_buf_size/8]=BigInt(bufSize);return 0}function _fd_close(fd){try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number(HEAPU64[iov/8]);var len=Number(HEAPU64[(iov+8)/8]);iov+=16;var curr=FS.read(stream,HEAP8,ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);HEAPU64[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){offset=bigintToI53Checked(offset);newOffset=bigintToI53Checked(newOffset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);HEAP64[newOffset/8]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number(HEAPU64[iov/8]);var len=Number(HEAPU64[(iov+8)/8]);iov+=16;var curr=FS.write(stream,HEAP8,ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);HEAPU64[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _random_get(buffer,size){buffer=bigintToI53Checked(buffer);size=bigintToI53Checked(size);try{randomFill(HEAPU8.subarray(buffer,buffer+size));return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var emwgpuStringToInt_FeatureName={"core-features-and-limits":1,"depth-clip-control":2,"depth32float-stencil8":3,"texture-compression-bc":4,"texture-compression-bc-sliced-3d":5,"texture-compression-etc2":6,"texture-compression-astc":7,"texture-compression-astc-sliced-3d":8,"timestamp-query":9,"indirect-first-instance":10,"shader-f16":11,"rg11b10ufloat-renderable":12,"bgra8unorm-storage":13,"float32-filterable":14,"float32-blendable":15,"clip-distances":16,"dual-source-blending":17,subgroups:18,"texture-formats-tier1":19,"texture-formats-tier2":20,"primitive-index":21,"texture-component-swizzle":22,"chromium-experimental-unorm16-texture-formats":327692,"chromium-experimental-multi-draw-indirect":327729};function _wgpuAdapterGetFeatures(adapterPtr,supportedFeatures){adapterPtr=bigintToI53Checked(adapterPtr);supportedFeatures=bigintToI53Checked(supportedFeatures);var adapter=WebGPU.getJsObject(adapterPtr);var featuresPtr=_malloc(adapter.features.size*4);var offset=0;var numFeatures=0;for(const feature of adapter.features){var featureEnumValue=emwgpuStringToInt_FeatureName[feature];if(featureEnumValue>=0){HEAP32[(featuresPtr+offset)/4]=featureEnumValue;offset+=4;numFeatures++}}HEAPU64[(supportedFeatures+8)/8]=BigInt(featuresPtr);HEAPU64[supportedFeatures/8]=BigInt(numFeatures)}function _wgpuAdapterGetInfo(adapterPtr,info){adapterPtr=bigintToI53Checked(adapterPtr);info=bigintToI53Checked(info);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1}function _wgpuAdapterGetLimits(adapterPtr,limitsOutPtr){adapterPtr=bigintToI53Checked(adapterPtr);limitsOutPtr=bigintToI53Checked(limitsOutPtr);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1}function _wgpuAdapterHasFeature(adapterPtr,featureEnumValue){adapterPtr=bigintToI53Checked(adapterPtr);var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])}var _wgpuBufferGetSize=function(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),timestampWrites:WebGPU.makePassTimestampWrites(Number(HEAPU64[(descriptor+24)/8]))}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr})();return BigInt(ret)};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){encoderPtr=bigintToI53Checked(encoderPtr);srcPtr=bigintToI53Checked(srcPtr);srcOffset=bigintToI53Checked(srcOffset);dstPtr=bigintToI53Checked(dstPtr);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr})();return BigInt(ret)};function _wgpuComputePassEncoderDispatchWorkgroups(passPtr,x,y,z){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)}function _wgpuComputePassEncoderEnd(passPtr){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.end()}function _wgpuComputePassEncoderSetBindGroup(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr){passPtr=bigintToI53Checked(passPtr);groupPtr=bigintToI53Checked(groupPtr);dynamicOffsetCount=bigintToI53Checked(dynamicOffsetCount);dynamicOffsetsPtr=bigintToI53Checked(dynamicOffsetsPtr);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,HEAPU32,dynamicOffsetsPtr/4,dynamicOffsetCount)}}function _wgpuComputePassEncoderSetPipeline(passPtr,pipelinePtr){passPtr=bigintToI53Checked(passPtr);pipelinePtr=bigintToI53Checked(pipelinePtr);var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)}var _wgpuComputePipelineGetBindGroupLayout=function(pipelinePtr,groupIndex){pipelinePtr=bigintToI53Checked(pipelinePtr);var ret=(()=>{var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0n);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateBindGroup=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{function makeEntry(entryPtr){var bufferPtr=Number(HEAPU64[(entryPtr+16)/8]);var samplerPtr=Number(HEAPU64[(entryPtr+40)/8]);var textureViewPtr=Number(HEAPU64[(entryPtr+48)/8]);var externalTexturePtr=0;WebGPU.iterateExtensions(entryPtr,{327681:ptr=>{externalTexturePtr=Number(HEAPU64[(ptr+16)/8])}});var resource;if(bufferPtr){var size=readI53FromI64(entryPtr+32);if(size==-1)size=undefined;resource={buffer:WebGPU.getJsObject(bufferPtr),offset:readI53FromI64(entryPtr+24),size}}else{resource=WebGPU.getJsObject(samplerPtr||textureViewPtr||externalTexturePtr)}return{binding:HEAPU32[(entryPtr+8)/4],resource}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+56*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.getJsObject(Number(HEAPU64[(descriptor+24)/8])),entries:makeEntries(Number(HEAPU64[(descriptor+32)/8]),Number(HEAPU64[(descriptor+40)/8]))};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateCommandEncoder=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateComputePipeline=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr})();return BigInt(ret)};var _wgpuQueueSubmit=function(queuePtr,commandCount,commands){queuePtr=bigintToI53Checked(queuePtr);commandCount=bigintToI53Checked(commandCount);commands=bigintToI53Checked(commands);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from(HEAP64.subarray(commands/8,(commands+commandCount*8)/8),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){queuePtr=bigintToI53Checked(queuePtr);bufferPtr=bigintToI53Checked(bufferPtr);bufferOffset=bigintToI53Checked(bufferOffset);data=bigintToI53Checked(data);size=bigintToI53Checked(size);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=HEAPU8.subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original=="function"){let isAsyncifyImport=original.isAsync||importPattern.test(x);if(isAsyncifyImport){imports[x]=original=new WebAssembly.Suspending(original)}}}},instrumentFunction(original){var wrapper=(...args)=>original(...args);return wrapper},instrumentWasmExports(exports){var exportPattern=/^(wllama_start|wllama_action|main|__main_argc_argv)$/;Asyncify.asyncExports=new Set;var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original=="function"){let isAsyncifyExport=exportPattern.test(x);if(isAsyncifyExport){Asyncify.asyncExports.add(original);original=Asyncify.makeAsyncFunction(original)}var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},asyncExports:null,isAsyncExport(func){return Asyncify.asyncExports?.has(func)},handleAsync:async startAsync=>{try{return await startAsync()}finally{}},handleSleep:startAsync=>Asyncify.handleAsync(()=>new Promise(startAsync)),makeAsyncFunction(original){return WebAssembly.promising(original)}};var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{HEAP8.set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={pointer:p=>BigInt(p),string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return BigInt(ret)},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return BigInt(ret)}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(Number(ret))}if(returnType==="pointer")return Number(ret);if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}var asyncMode=opts?.async;if(asyncMode)return ret.then(onDone);ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return(...args)=>ccall(ident,returnType,argTypes,args,opts)};var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()()}}}Module["mmapAlloc"]=mmapAlloc;Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["FS_preloadFile"]=FS_preloadFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS"]=FS;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;Module["MEMFS"]=MEMFS;var _wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug,_main,_malloc,_free,_emwgpuCreateBindGroup,_emwgpuCreateBindGroupLayout,_emwgpuCreateCommandBuffer,_emwgpuCreateCommandEncoder,_emwgpuCreateComputePassEncoder,_emwgpuCreateComputePipeline,_emwgpuCreateExternalTexture,_emwgpuCreatePipelineLayout,_emwgpuCreateQuerySet,_emwgpuCreateRenderBundle,_emwgpuCreateRenderBundleEncoder,_emwgpuCreateRenderPassEncoder,_emwgpuCreateRenderPipeline,_emwgpuCreateSampler,_emwgpuCreateSurface,_emwgpuCreateTexture,_emwgpuCreateTextureView,_emwgpuCreateAdapter,_emwgpuCreateBuffer,_emwgpuCreateDevice,_emwgpuCreateQueue,_emwgpuCreateShaderModule,_emwgpuOnDeviceLostCompleted,_emwgpuOnMapAsyncCompleted,_emwgpuOnRequestAdapterCompleted,_emwgpuOnRequestDeviceCompleted,_emwgpuOnWorkDoneCompleted,_emwgpuOnUncapturedError,_emscripten_builtin_memalign,__emscripten_timeout,_memalign,___trap,__emscripten_stack_restore,__emscripten_stack_alloc,_emscripten_stack_get_current,__indirect_function_table,wasmTable;function assignWasmExports(wasmExports){_wllama_malloc=Module["_wllama_malloc"]=wasmExports["wllama_malloc"];_wllama_start=Module["_wllama_start"]=wasmExports["wllama_start"];_wllama_action=Module["_wllama_action"]=wasmExports["wllama_action"];_wllama_exit=Module["_wllama_exit"]=wasmExports["wllama_exit"];_wllama_debug=Module["_wllama_debug"]=wasmExports["wllama_debug"];_main=Module["_main"]=wasmExports["main"];_malloc=wasmExports["malloc"];_free=wasmExports["free"];_emwgpuCreateBindGroup=wasmExports["emwgpuCreateBindGroup"];_emwgpuCreateBindGroupLayout=wasmExports["emwgpuCreateBindGroupLayout"];_emwgpuCreateCommandBuffer=wasmExports["emwgpuCreateCommandBuffer"];_emwgpuCreateCommandEncoder=wasmExports["emwgpuCreateCommandEncoder"];_emwgpuCreateComputePassEncoder=wasmExports["emwgpuCreateComputePassEncoder"];_emwgpuCreateComputePipeline=wasmExports["emwgpuCreateComputePipeline"];_emwgpuCreateExternalTexture=wasmExports["emwgpuCreateExternalTexture"];_emwgpuCreatePipelineLayout=wasmExports["emwgpuCreatePipelineLayout"];_emwgpuCreateQuerySet=wasmExports["emwgpuCreateQuerySet"];_emwgpuCreateRenderBundle=wasmExports["emwgpuCreateRenderBundle"];_emwgpuCreateRenderBundleEncoder=wasmExports["emwgpuCreateRenderBundleEncoder"];_emwgpuCreateRenderPassEncoder=wasmExports["emwgpuCreateRenderPassEncoder"];_emwgpuCreateRenderPipeline=wasmExports["emwgpuCreateRenderPipeline"];_emwgpuCreateSampler=wasmExports["emwgpuCreateSampler"];_emwgpuCreateSurface=wasmExports["emwgpuCreateSurface"];_emwgpuCreateTexture=wasmExports["emwgpuCreateTexture"];_emwgpuCreateTextureView=wasmExports["emwgpuCreateTextureView"];_emwgpuCreateAdapter=wasmExports["emwgpuCreateAdapter"];_emwgpuCreateBuffer=wasmExports["emwgpuCreateBuffer"];_emwgpuCreateDevice=wasmExports["emwgpuCreateDevice"];_emwgpuCreateQueue=wasmExports["emwgpuCreateQueue"];_emwgpuCreateShaderModule=wasmExports["emwgpuCreateShaderModule"];_emwgpuOnDeviceLostCompleted=wasmExports["emwgpuOnDeviceLostCompleted"];_emwgpuOnMapAsyncCompleted=wasmExports["emwgpuOnMapAsyncCompleted"];_emwgpuOnRequestAdapterCompleted=wasmExports["emwgpuOnRequestAdapterCompleted"];_emwgpuOnRequestDeviceCompleted=wasmExports["emwgpuOnRequestDeviceCompleted"];_emwgpuOnWorkDoneCompleted=wasmExports["emwgpuOnWorkDoneCompleted"];_emwgpuOnUncapturedError=wasmExports["emwgpuOnUncapturedError"];_emscripten_builtin_memalign=wasmExports["emscripten_builtin_memalign"];__emscripten_timeout=wasmExports["_emscripten_timeout"];_memalign=wasmExports["memalign"];___trap=wasmExports["__trap"];__emscripten_stack_restore=wasmExports["_emscripten_stack_restore"];__emscripten_stack_alloc=wasmExports["_emscripten_stack_alloc"];_emscripten_stack_get_current=wasmExports["emscripten_stack_get_current"];__indirect_function_table=wasmTable=wasmExports["__indirect_function_table"]}var wasmImports={__syscall_fcntl64:___syscall_fcntl64,__syscall_getcwd:___syscall_getcwd,__syscall_getdents64:___syscall_getdents64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,__syscall_stat64:___syscall_stat64,_abort_js:__abort_js,_emscripten_runtime_keepalive_clear:__emscripten_runtime_keepalive_clear,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_setitimer_js:__setitimer_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_date_now:_emscripten_date_now,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,proc_exit:_proc_exit,random_get:_random_get,wgpuAdapterGetFeatures:_wgpuAdapterGetFeatures,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer};function applySignatureConversions(wasmExports){wasmExports=Object.assign({},wasmExports);var makeWrapper___PP=f=>(a0,a1,a2)=>f(a0,BigInt(a1?a1:0),BigInt(a2?a2:0));var makeWrapper_pp=f=>a0=>Number(f(BigInt(a0)));var makeWrapper__p=f=>a0=>f(BigInt(a0));var makeWrapper_ppp=f=>(a0,a1)=>Number(f(BigInt(a0),BigInt(a1)));var makeWrapper_p=f=>()=>Number(f());wasmExports["main"]=makeWrapper___PP(wasmExports["main"]);wasmExports["malloc"]=makeWrapper_pp(wasmExports["malloc"]);wasmExports["free"]=makeWrapper__p(wasmExports["free"]);wasmExports["emscripten_builtin_memalign"]=makeWrapper_ppp(wasmExports["emscripten_builtin_memalign"]);wasmExports["memalign"]=makeWrapper_ppp(wasmExports["memalign"]);wasmExports["_emscripten_stack_restore"]=makeWrapper__p(wasmExports["_emscripten_stack_restore"]);wasmExports["_emscripten_stack_alloc"]=makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);wasmExports["emscripten_stack_get_current"]=makeWrapper_p(wasmExports["emscripten_stack_get_current"]);return wasmExports}async function callMain(){var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,BigInt(argv));ret=await ret;exitJS(ret,true);return ret}catch(e){return handleException(e)}}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}async function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();Module["onRuntimeInitialized"]?.();var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)await callMain();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}}var wasmExports;createWasm();run();\n';
var WLLAMA_ASYNCIFY_SINGLE_THREAD_CODE = "var Module = typeof Module != 'undefined' ? Module : {};\nvar ENVIRONMENT_IS_WEB = !!globalThis.window;\nvar ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;\nvar ENVIRONMENT_IS_NODE =\n  globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';\nvar arguments_ = [];\nvar thisProgram = './this.program';\nvar quit_ = (status, toThrow) => {\n  throw toThrow;\n};\nvar _scriptName = globalThis.document?.currentScript?.src;\nif (typeof __filename != 'undefined') {\n  _scriptName = __filename;\n} else if (ENVIRONMENT_IS_WORKER) {\n  _scriptName = self.location.href;\n}\nvar scriptDirectory = '';\nfunction locateFile(path) {\n  if (Module['locateFile']) {\n    return Module['locateFile'](path, scriptDirectory);\n  }\n  return scriptDirectory + path;\n}\nvar readAsync, readBinary;\nif (ENVIRONMENT_IS_NODE) {\n  var fs = require('fs');\n  scriptDirectory = __dirname + '/';\n  readBinary = (filename) => {\n    filename = isFileURI(filename) ? new URL(filename) : filename;\n    var ret = fs.readFileSync(filename);\n    return ret;\n  };\n  readAsync = async (filename, binary = true) => {\n    filename = isFileURI(filename) ? new URL(filename) : filename;\n    var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');\n    return ret;\n  };\n  if (process.argv.length > 1) {\n    thisProgram = process.argv[1].replace(/\\\\/g, '/');\n  }\n  arguments_ = process.argv.slice(2);\n  if (typeof module != 'undefined') {\n    module['exports'] = Module;\n  }\n  quit_ = (status, toThrow) => {\n    process.exitCode = status;\n    throw toThrow;\n  };\n} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {\n  try {\n    scriptDirectory = new URL('.', _scriptName).href;\n  } catch {}\n  {\n    if (ENVIRONMENT_IS_WORKER) {\n      readBinary = (url) => {\n        var xhr = new XMLHttpRequest();\n        xhr.open('GET', url, false);\n        xhr.responseType = 'arraybuffer';\n        xhr.send(null);\n        return new Uint8Array(xhr.response);\n      };\n    }\n    readAsync = async (url) => {\n      if (isFileURI(url)) {\n        return new Promise((resolve, reject) => {\n          var xhr = new XMLHttpRequest();\n          xhr.open('GET', url, true);\n          xhr.responseType = 'arraybuffer';\n          xhr.onload = () => {\n            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {\n              resolve(xhr.response);\n              return;\n            }\n            reject(xhr.status);\n          };\n          xhr.onerror = reject;\n          xhr.send(null);\n        });\n      }\n      var response = await fetch(url, { credentials: 'same-origin' });\n      if (response.ok) {\n        return response.arrayBuffer();\n      }\n      throw new Error(response.status + ' : ' + response.url);\n    };\n  }\n} else {\n}\nvar out = console.log.bind(console);\nvar err = console.error.bind(console);\nvar wasmBinary;\nvar ABORT = false;\nvar EXITSTATUS;\nfunction assert(condition, text) {\n  if (!condition) {\n    abort(text);\n  }\n}\nvar isFileURI = (filename) => filename.startsWith('file://');\nvar HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;\nvar HEAP64, HEAPU64;\nvar runtimeInitialized = false;\nfunction updateMemoryViews() {\n  var b = wasmMemory.buffer;\n  HEAP8 = new Int8Array(b);\n  HEAP16 = new Int16Array(b);\n  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);\n  HEAPU16 = new Uint16Array(b);\n  HEAP32 = new Int32Array(b);\n  HEAPU32 = new Uint32Array(b);\n  HEAPF32 = new Float32Array(b);\n  HEAPF64 = new Float64Array(b);\n  HEAP64 = new BigInt64Array(b);\n  HEAPU64 = new BigUint64Array(b);\n}\nfunction initMemory() {\n  if (Module['wasmMemory']) {\n    wasmMemory = Module['wasmMemory'];\n  } else {\n    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 134217728;\n    wasmMemory = new WebAssembly.Memory({\n      initial: INITIAL_MEMORY / 65536,\n      maximum: 65536,\n    });\n  }\n  updateMemoryViews();\n}\nfunction preRun() {\n  if (Module['preRun']) {\n    if (typeof Module['preRun'] == 'function')\n      Module['preRun'] = [Module['preRun']];\n    while (Module['preRun'].length) {\n      addOnPreRun(Module['preRun'].shift());\n    }\n  }\n  callRuntimeCallbacks(onPreRuns);\n}\nfunction initRuntime() {\n  runtimeInitialized = true;\n  if (!Module['noFSInit'] && !FS.initialized) FS.init();\n  TTY.init();\n  wasmExports['tb']();\n  FS.ignorePermissions = false;\n}\nfunction preMain() {}\nfunction postRun() {\n  if (Module['postRun']) {\n    if (typeof Module['postRun'] == 'function')\n      Module['postRun'] = [Module['postRun']];\n    while (Module['postRun'].length) {\n      addOnPostRun(Module['postRun'].shift());\n    }\n  }\n  callRuntimeCallbacks(onPostRuns);\n}\nfunction abort(what) {\n  Module['onAbort']?.(what);\n  what = 'Aborted(' + what + ')';\n  err(what);\n  ABORT = true;\n  what += '. Build with -sASSERTIONS for more info.';\n  var e = new WebAssembly.RuntimeError(what);\n  throw e;\n}\nvar wasmBinaryFile;\nfunction findWasmBinary() {\n  return locateFile('wllama.wasm');\n}\nfunction getBinarySync(file) {\n  if (file == wasmBinaryFile && wasmBinary) {\n    return new Uint8Array(wasmBinary);\n  }\n  if (readBinary) {\n    return readBinary(file);\n  }\n  throw 'both async and sync fetching of the wasm failed';\n}\nasync function getWasmBinary(binaryFile) {\n  if (!wasmBinary) {\n    try {\n      var response = await readAsync(binaryFile);\n      return new Uint8Array(response);\n    } catch {}\n  }\n  return getBinarySync(binaryFile);\n}\nasync function instantiateArrayBuffer(binaryFile, imports) {\n  try {\n    var binary = await getWasmBinary(binaryFile);\n    var instance = await WebAssembly.instantiate(binary, imports);\n    return instance;\n  } catch (reason) {\n    err(`failed to asynchronously prepare wasm: ${reason}`);\n    abort(reason);\n  }\n}\nasync function instantiateAsync(binary, binaryFile, imports) {\n  if (!binary && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {\n    try {\n      var response = fetch(binaryFile, { credentials: 'same-origin' });\n      var instantiationResult = await WebAssembly.instantiateStreaming(\n        response,\n        imports\n      );\n      return instantiationResult;\n    } catch (reason) {\n      err(`wasm streaming compile failed: ${reason}`);\n      err('falling back to ArrayBuffer instantiation');\n    }\n  }\n  return instantiateArrayBuffer(binaryFile, imports);\n}\nfunction getWasmImports() {\n  var imports = { a: wasmImports };\n  return imports;\n}\nasync function createWasm() {\n  function receiveInstance(instance, module) {\n    wasmExports = instance.exports;\n    wasmExports = Asyncify.instrumentWasmExports(wasmExports);\n    wasmExports = applySignatureConversions(wasmExports);\n    assignWasmExports(wasmExports);\n    removeRunDependency('wasm-instantiate');\n    return wasmExports;\n  }\n  addRunDependency('wasm-instantiate');\n  function receiveInstantiationResult(result) {\n    return receiveInstance(result['instance']);\n  }\n  var info = getWasmImports();\n  if (Module['instantiateWasm']) {\n    return new Promise((resolve, reject) => {\n      Module['instantiateWasm'](info, (inst, mod) => {\n        resolve(receiveInstance(inst, mod));\n      });\n    });\n  }\n  wasmBinaryFile ??= findWasmBinary();\n  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);\n  var exports = receiveInstantiationResult(result);\n  return exports;\n}\nclass ExitStatus {\n  name = 'ExitStatus';\n  constructor(status) {\n    this.message = `Program terminated with exit(${status})`;\n    this.status = status;\n  }\n}\nvar callRuntimeCallbacks = (callbacks) => {\n  while (callbacks.length > 0) {\n    callbacks.shift()(Module);\n  }\n};\nvar onPostRuns = [];\nvar addOnPostRun = (cb) => onPostRuns.push(cb);\nvar onPreRuns = [];\nvar addOnPreRun = (cb) => onPreRuns.push(cb);\nvar runDependencies = 0;\nvar dependenciesFulfilled = null;\nvar removeRunDependency = (id) => {\n  runDependencies--;\n  Module['monitorRunDependencies']?.(runDependencies);\n  if (runDependencies == 0) {\n    if (dependenciesFulfilled) {\n      var callback = dependenciesFulfilled;\n      dependenciesFulfilled = null;\n      callback();\n    }\n  }\n};\nvar addRunDependency = (id) => {\n  runDependencies++;\n  Module['monitorRunDependencies']?.(runDependencies);\n};\nvar dynCalls = {};\nvar noExitRuntime = true;\nvar stackRestore = (val) => __emscripten_stack_restore(val);\nvar stackSave = () => _emscripten_stack_get_current();\nvar wasmMemory;\nvar exceptionCaught = [];\nvar uncaughtExceptionCount = 0;\nvar INT53_MAX = 9007199254740992;\nvar INT53_MIN = -9007199254740992;\nvar bigintToI53Checked = (num) =>\n  num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);\nfunction ___cxa_begin_catch(ptr) {\n  ptr >>>= 0;\n  var info = new ExceptionInfo(ptr);\n  if (!info.get_caught()) {\n    info.set_caught(true);\n    uncaughtExceptionCount--;\n  }\n  info.set_rethrown(false);\n  exceptionCaught.push(info);\n  ___cxa_increment_exception_refcount(ptr);\n  return ___cxa_get_exception_ptr(ptr);\n}\nfunction ___cxa_current_primary_exception() {\n  if (!exceptionCaught.length) {\n    return 0;\n  }\n  var info = exceptionCaught[exceptionCaught.length - 1];\n  ___cxa_increment_exception_refcount(info.excPtr);\n  return info.excPtr;\n}\nvar exceptionLast = 0;\nvar ___cxa_end_catch = () => {\n  _setThrew(0, 0);\n  var info = exceptionCaught.pop();\n  ___cxa_decrement_exception_refcount(info.excPtr);\n  exceptionLast = 0;\n};\nclass ExceptionInfo {\n  constructor(excPtr) {\n    this.excPtr = excPtr;\n    this.ptr = excPtr - 24;\n  }\n  set_type(type) {\n    HEAPU32[((this.ptr + 4) >>> 2) >>> 0] = type;\n  }\n  get_type() {\n    return HEAPU32[((this.ptr + 4) >>> 2) >>> 0];\n  }\n  set_destructor(destructor) {\n    HEAPU32[((this.ptr + 8) >>> 2) >>> 0] = destructor;\n  }\n  get_destructor() {\n    return HEAPU32[((this.ptr + 8) >>> 2) >>> 0];\n  }\n  set_caught(caught) {\n    caught = caught ? 1 : 0;\n    HEAP8[(this.ptr + 12) >>> 0] = caught;\n  }\n  get_caught() {\n    return HEAP8[(this.ptr + 12) >>> 0] != 0;\n  }\n  set_rethrown(rethrown) {\n    rethrown = rethrown ? 1 : 0;\n    HEAP8[(this.ptr + 13) >>> 0] = rethrown;\n  }\n  get_rethrown() {\n    return HEAP8[(this.ptr + 13) >>> 0] != 0;\n  }\n  init(type, destructor) {\n    this.set_adjusted_ptr(0);\n    this.set_type(type);\n    this.set_destructor(destructor);\n  }\n  set_adjusted_ptr(adjustedPtr) {\n    HEAPU32[((this.ptr + 16) >>> 2) >>> 0] = adjustedPtr;\n  }\n  get_adjusted_ptr() {\n    return HEAPU32[((this.ptr + 16) >>> 2) >>> 0];\n  }\n}\nvar setTempRet0 = (val) => __emscripten_tempret_set(val);\nvar findMatchingCatch = (args) => {\n  var thrown = exceptionLast;\n  if (!thrown) {\n    setTempRet0(0);\n    return 0;\n  }\n  var info = new ExceptionInfo(thrown);\n  info.set_adjusted_ptr(thrown);\n  var thrownType = info.get_type();\n  if (!thrownType) {\n    setTempRet0(0);\n    return thrown;\n  }\n  for (var caughtType of args) {\n    if (caughtType === 0 || caughtType === thrownType) {\n      break;\n    }\n    var adjusted_ptr_addr = info.ptr + 16;\n    if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {\n      setTempRet0(caughtType);\n      return thrown;\n    }\n  }\n  setTempRet0(thrownType);\n  return thrown;\n};\nfunction ___cxa_find_matching_catch_2() {\n  return findMatchingCatch([]);\n}\nfunction ___cxa_find_matching_catch_3(arg0) {\n  arg0 >>>= 0;\n  return findMatchingCatch([arg0]);\n}\nfunction ___cxa_find_matching_catch_4(arg0, arg1) {\n  arg0 >>>= 0;\n  arg1 >>>= 0;\n  return findMatchingCatch([arg0, arg1]);\n}\nvar ___cxa_rethrow = () => {\n  var info = exceptionCaught.pop();\n  if (!info) {\n    abort('no exception to throw');\n  }\n  var ptr = info.excPtr;\n  if (!info.get_rethrown()) {\n    exceptionCaught.push(info);\n    info.set_rethrown(true);\n    info.set_caught(false);\n    uncaughtExceptionCount++;\n  }\n  exceptionLast = ptr;\n  throw exceptionLast;\n};\nfunction ___cxa_rethrow_primary_exception(ptr) {\n  ptr >>>= 0;\n  if (!ptr) return;\n  var info = new ExceptionInfo(ptr);\n  exceptionCaught.push(info);\n  info.set_rethrown(true);\n  ___cxa_rethrow();\n}\nfunction ___cxa_throw(ptr, type, destructor) {\n  ptr >>>= 0;\n  type >>>= 0;\n  destructor >>>= 0;\n  var info = new ExceptionInfo(ptr);\n  info.init(type, destructor);\n  exceptionLast = ptr;\n  uncaughtExceptionCount++;\n  throw exceptionLast;\n}\nvar ___cxa_uncaught_exceptions = () => uncaughtExceptionCount;\nfunction ___resumeException(ptr) {\n  ptr >>>= 0;\n  if (!exceptionLast) {\n    exceptionLast = ptr;\n  }\n  throw exceptionLast;\n}\nvar syscallGetVarargI = () => {\n  var ret = HEAP32[(+SYSCALLS.varargs >>> 2) >>> 0];\n  SYSCALLS.varargs += 4;\n  return ret;\n};\nvar syscallGetVarargP = syscallGetVarargI;\nvar PATH = {\n  isAbs: (path) => path.charAt(0) === '/',\n  splitPath: (filename) => {\n    var splitPathRe =\n      /^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;\n    return splitPathRe.exec(filename).slice(1);\n  },\n  normalizeArray: (parts, allowAboveRoot) => {\n    var up = 0;\n    for (var i = parts.length - 1; i >= 0; i--) {\n      var last = parts[i];\n      if (last === '.') {\n        parts.splice(i, 1);\n      } else if (last === '..') {\n        parts.splice(i, 1);\n        up++;\n      } else if (up) {\n        parts.splice(i, 1);\n        up--;\n      }\n    }\n    if (allowAboveRoot) {\n      for (; up; up--) {\n        parts.unshift('..');\n      }\n    }\n    return parts;\n  },\n  normalize: (path) => {\n    var isAbsolute = PATH.isAbs(path),\n      trailingSlash = path.slice(-1) === '/';\n    path = PATH.normalizeArray(\n      path.split('/').filter((p) => !!p),\n      !isAbsolute\n    ).join('/');\n    if (!path && !isAbsolute) {\n      path = '.';\n    }\n    if (path && trailingSlash) {\n      path += '/';\n    }\n    return (isAbsolute ? '/' : '') + path;\n  },\n  dirname: (path) => {\n    var result = PATH.splitPath(path),\n      root = result[0],\n      dir = result[1];\n    if (!root && !dir) {\n      return '.';\n    }\n    if (dir) {\n      dir = dir.slice(0, -1);\n    }\n    return root + dir;\n  },\n  basename: (path) => path && path.match(/([^\\/]+|\\/)\\/*$/)[1],\n  join: (...paths) => PATH.normalize(paths.join('/')),\n  join2: (l, r) => PATH.normalize(l + '/' + r),\n};\nvar initRandomFill = () => {\n  if (ENVIRONMENT_IS_NODE) {\n    var nodeCrypto = require('crypto');\n    return (view) => nodeCrypto.randomFillSync(view);\n  }\n  return (view) => crypto.getRandomValues(view);\n};\nvar randomFill = (view) => {\n  (randomFill = initRandomFill())(view);\n};\nvar PATH_FS = {\n  resolve: (...args) => {\n    var resolvedPath = '',\n      resolvedAbsolute = false;\n    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {\n      var path = i >= 0 ? args[i] : FS.cwd();\n      if (typeof path != 'string') {\n        throw new TypeError('Arguments to path.resolve must be strings');\n      } else if (!path) {\n        return '';\n      }\n      resolvedPath = path + '/' + resolvedPath;\n      resolvedAbsolute = PATH.isAbs(path);\n    }\n    resolvedPath = PATH.normalizeArray(\n      resolvedPath.split('/').filter((p) => !!p),\n      !resolvedAbsolute\n    ).join('/');\n    return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';\n  },\n  relative: (from, to) => {\n    from = PATH_FS.resolve(from).slice(1);\n    to = PATH_FS.resolve(to).slice(1);\n    function trim(arr) {\n      var start = 0;\n      for (; start < arr.length; start++) {\n        if (arr[start] !== '') break;\n      }\n      var end = arr.length - 1;\n      for (; end >= 0; end--) {\n        if (arr[end] !== '') break;\n      }\n      if (start > end) return [];\n      return arr.slice(start, end - start + 1);\n    }\n    var fromParts = trim(from.split('/'));\n    var toParts = trim(to.split('/'));\n    var length = Math.min(fromParts.length, toParts.length);\n    var samePartsLength = length;\n    for (var i = 0; i < length; i++) {\n      if (fromParts[i] !== toParts[i]) {\n        samePartsLength = i;\n        break;\n      }\n    }\n    var outputParts = [];\n    for (var i = samePartsLength; i < fromParts.length; i++) {\n      outputParts.push('..');\n    }\n    outputParts = outputParts.concat(toParts.slice(samePartsLength));\n    return outputParts.join('/');\n  },\n};\nvar UTF8Decoder = globalThis.TextDecoder && new TextDecoder();\nvar findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {\n  var maxIdx = idx + maxBytesToRead;\n  if (ignoreNul) return maxIdx;\n  while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;\n  return idx;\n};\nvar UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {\n  idx >>>= 0;\n  var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);\n  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {\n    return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));\n  }\n  var str = '';\n  while (idx < endPtr) {\n    var u0 = heapOrArray[idx++];\n    if (!(u0 & 128)) {\n      str += String.fromCharCode(u0);\n      continue;\n    }\n    var u1 = heapOrArray[idx++] & 63;\n    if ((u0 & 224) == 192) {\n      str += String.fromCharCode(((u0 & 31) << 6) | u1);\n      continue;\n    }\n    var u2 = heapOrArray[idx++] & 63;\n    if ((u0 & 240) == 224) {\n      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;\n    } else {\n      u0 =\n        ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);\n    }\n    if (u0 < 65536) {\n      str += String.fromCharCode(u0);\n    } else {\n      var ch = u0 - 65536;\n      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));\n    }\n  }\n  return str;\n};\nvar FS_stdin_getChar_buffer = [];\nvar lengthBytesUTF8 = (str) => {\n  var len = 0;\n  for (var i = 0; i < str.length; ++i) {\n    var c = str.charCodeAt(i);\n    if (c <= 127) {\n      len++;\n    } else if (c <= 2047) {\n      len += 2;\n    } else if (c >= 55296 && c <= 57343) {\n      len += 4;\n      ++i;\n    } else {\n      len += 3;\n    }\n  }\n  return len;\n};\nvar stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {\n  outIdx >>>= 0;\n  if (!(maxBytesToWrite > 0)) return 0;\n  var startIdx = outIdx;\n  var endIdx = outIdx + maxBytesToWrite - 1;\n  for (var i = 0; i < str.length; ++i) {\n    var u = str.codePointAt(i);\n    if (u <= 127) {\n      if (outIdx >= endIdx) break;\n      heap[outIdx++ >>> 0] = u;\n    } else if (u <= 2047) {\n      if (outIdx + 1 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 192 | (u >> 6);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n    } else if (u <= 65535) {\n      if (outIdx + 2 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 224 | (u >> 12);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n    } else {\n      if (outIdx + 3 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 240 | (u >> 18);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 12) & 63);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n      i++;\n    }\n  }\n  heap[outIdx >>> 0] = 0;\n  return outIdx - startIdx;\n};\nvar intArrayFromString = (stringy, dontAddNull, length) => {\n  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;\n  var u8array = new Array(len);\n  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);\n  if (dontAddNull) u8array.length = numBytesWritten;\n  return u8array;\n};\nvar FS_stdin_getChar = () => {\n  if (!FS_stdin_getChar_buffer.length) {\n    var result = null;\n    if (ENVIRONMENT_IS_NODE) {\n      var BUFSIZE = 256;\n      var buf = Buffer.alloc(BUFSIZE);\n      var bytesRead = 0;\n      var fd = process.stdin.fd;\n      try {\n        bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);\n      } catch (e) {\n        if (e.toString().includes('EOF')) bytesRead = 0;\n        else throw e;\n      }\n      if (bytesRead > 0) {\n        result = buf.slice(0, bytesRead).toString('utf-8');\n      }\n    } else if (globalThis.window?.prompt) {\n      result = window.prompt('Input: ');\n      if (result !== null) {\n        result += '\\n';\n      }\n    } else {\n    }\n    if (!result) {\n      return null;\n    }\n    FS_stdin_getChar_buffer = intArrayFromString(result, true);\n  }\n  return FS_stdin_getChar_buffer.shift();\n};\nvar TTY = {\n  ttys: [],\n  init() {},\n  shutdown() {},\n  register(dev, ops) {\n    TTY.ttys[dev] = { input: [], output: [], ops };\n    FS.registerDevice(dev, TTY.stream_ops);\n  },\n  stream_ops: {\n    open(stream) {\n      var tty = TTY.ttys[stream.node.rdev];\n      if (!tty) {\n        throw new FS.ErrnoError(43);\n      }\n      stream.tty = tty;\n      stream.seekable = false;\n    },\n    close(stream) {\n      stream.tty.ops.fsync(stream.tty);\n    },\n    fsync(stream) {\n      stream.tty.ops.fsync(stream.tty);\n    },\n    read(stream, buffer, offset, length, pos) {\n      if (!stream.tty || !stream.tty.ops.get_char) {\n        throw new FS.ErrnoError(60);\n      }\n      var bytesRead = 0;\n      for (var i = 0; i < length; i++) {\n        var result;\n        try {\n          result = stream.tty.ops.get_char(stream.tty);\n        } catch (e) {\n          throw new FS.ErrnoError(29);\n        }\n        if (result === undefined && bytesRead === 0) {\n          throw new FS.ErrnoError(6);\n        }\n        if (result === null || result === undefined) break;\n        bytesRead++;\n        buffer[offset + i] = result;\n      }\n      if (bytesRead) {\n        stream.node.atime = Date.now();\n      }\n      return bytesRead;\n    },\n    write(stream, buffer, offset, length, pos) {\n      if (!stream.tty || !stream.tty.ops.put_char) {\n        throw new FS.ErrnoError(60);\n      }\n      try {\n        for (var i = 0; i < length; i++) {\n          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);\n        }\n      } catch (e) {\n        throw new FS.ErrnoError(29);\n      }\n      if (length) {\n        stream.node.mtime = stream.node.ctime = Date.now();\n      }\n      return i;\n    },\n  },\n  default_tty_ops: {\n    get_char(tty) {\n      return FS_stdin_getChar();\n    },\n    put_char(tty, val) {\n      if (val === null || val === 10) {\n        out(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      } else {\n        if (val != 0) tty.output.push(val);\n      }\n    },\n    fsync(tty) {\n      if (tty.output?.length > 0) {\n        out(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      }\n    },\n    ioctl_tcgets(tty) {\n      return {\n        c_iflag: 25856,\n        c_oflag: 5,\n        c_cflag: 191,\n        c_lflag: 35387,\n        c_cc: [\n          3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0,\n          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n        ],\n      };\n    },\n    ioctl_tcsets(tty, optional_actions, data) {\n      return 0;\n    },\n    ioctl_tiocgwinsz(tty) {\n      return [24, 80];\n    },\n  },\n  default_tty1_ops: {\n    put_char(tty, val) {\n      if (val === null || val === 10) {\n        err(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      } else {\n        if (val != 0) tty.output.push(val);\n      }\n    },\n    fsync(tty) {\n      if (tty.output?.length > 0) {\n        err(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      }\n    },\n  },\n};\nvar zeroMemory = (ptr, size) => HEAPU8.fill(0, ptr, ptr + size);\nvar alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;\nvar mmapAlloc = (size) => {\n  size = alignMemory(size, 65536);\n  var ptr = _emscripten_builtin_memalign(65536, size);\n  if (ptr) zeroMemory(ptr, size);\n  return ptr;\n};\nvar MEMFS = {\n  ops_table: null,\n  mount(mount) {\n    return MEMFS.createNode(null, '/', 16895, 0);\n  },\n  createNode(parent, name, mode, dev) {\n    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {\n      throw new FS.ErrnoError(63);\n    }\n    MEMFS.ops_table ||= {\n      dir: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n          lookup: MEMFS.node_ops.lookup,\n          mknod: MEMFS.node_ops.mknod,\n          rename: MEMFS.node_ops.rename,\n          unlink: MEMFS.node_ops.unlink,\n          rmdir: MEMFS.node_ops.rmdir,\n          readdir: MEMFS.node_ops.readdir,\n          symlink: MEMFS.node_ops.symlink,\n        },\n        stream: { llseek: MEMFS.stream_ops.llseek },\n      },\n      file: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n        },\n        stream: {\n          llseek: MEMFS.stream_ops.llseek,\n          read: MEMFS.stream_ops.read,\n          write: MEMFS.stream_ops.write,\n          mmap: MEMFS.stream_ops.mmap,\n          msync: MEMFS.stream_ops.msync,\n        },\n      },\n      link: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n          readlink: MEMFS.node_ops.readlink,\n        },\n        stream: {},\n      },\n      chrdev: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n        },\n        stream: FS.chrdev_stream_ops,\n      },\n    };\n    var node = FS.createNode(parent, name, mode, dev);\n    if (FS.isDir(node.mode)) {\n      node.node_ops = MEMFS.ops_table.dir.node;\n      node.stream_ops = MEMFS.ops_table.dir.stream;\n      node.contents = {};\n    } else if (FS.isFile(node.mode)) {\n      node.node_ops = MEMFS.ops_table.file.node;\n      node.stream_ops = MEMFS.ops_table.file.stream;\n      node.usedBytes = 0;\n      node.contents = null;\n    } else if (FS.isLink(node.mode)) {\n      node.node_ops = MEMFS.ops_table.link.node;\n      node.stream_ops = MEMFS.ops_table.link.stream;\n    } else if (FS.isChrdev(node.mode)) {\n      node.node_ops = MEMFS.ops_table.chrdev.node;\n      node.stream_ops = MEMFS.ops_table.chrdev.stream;\n    }\n    node.atime = node.mtime = node.ctime = Date.now();\n    if (parent) {\n      parent.contents[name] = node;\n      parent.atime = parent.mtime = parent.ctime = node.atime;\n    }\n    return node;\n  },\n  getFileDataAsTypedArray(node) {\n    if (!node.contents) return new Uint8Array(0);\n    if (node.contents.subarray)\n      return node.contents.subarray(0, node.usedBytes);\n    return new Uint8Array(node.contents);\n  },\n  expandFileStorage(node, newCapacity) {\n    var prevCapacity = node.contents ? node.contents.length : 0;\n    if (prevCapacity >= newCapacity) return;\n    var CAPACITY_DOUBLING_MAX = 1024 * 1024;\n    newCapacity = Math.max(\n      newCapacity,\n      (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>> 0\n    );\n    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);\n    var oldContents = node.contents;\n    node.contents = new Uint8Array(newCapacity);\n    if (node.usedBytes > 0)\n      node.contents.set(oldContents.subarray(0, node.usedBytes), 0);\n  },\n  resizeFileStorage(node, newSize) {\n    if (node.usedBytes == newSize) return;\n    if (newSize == 0) {\n      node.contents = null;\n      node.usedBytes = 0;\n    } else {\n      var oldContents = node.contents;\n      node.contents = new Uint8Array(newSize);\n      if (oldContents) {\n        node.contents.set(\n          oldContents.subarray(0, Math.min(newSize, node.usedBytes))\n        );\n      }\n      node.usedBytes = newSize;\n    }\n  },\n  node_ops: {\n    getattr(node) {\n      var attr = {};\n      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;\n      attr.ino = node.id;\n      attr.mode = node.mode;\n      attr.nlink = 1;\n      attr.uid = 0;\n      attr.gid = 0;\n      attr.rdev = node.rdev;\n      if (FS.isDir(node.mode)) {\n        attr.size = 4096;\n      } else if (FS.isFile(node.mode)) {\n        attr.size = node.usedBytes;\n      } else if (FS.isLink(node.mode)) {\n        attr.size = node.link.length;\n      } else {\n        attr.size = 0;\n      }\n      attr.atime = new Date(node.atime);\n      attr.mtime = new Date(node.mtime);\n      attr.ctime = new Date(node.ctime);\n      attr.blksize = 4096;\n      attr.blocks = Math.ceil(attr.size / attr.blksize);\n      return attr;\n    },\n    setattr(node, attr) {\n      for (const key of ['mode', 'atime', 'mtime', 'ctime']) {\n        if (attr[key] != null) {\n          node[key] = attr[key];\n        }\n      }\n      if (attr.size !== undefined) {\n        MEMFS.resizeFileStorage(node, attr.size);\n      }\n    },\n    lookup(parent, name) {\n      if (!MEMFS.doesNotExistError) {\n        MEMFS.doesNotExistError = new FS.ErrnoError(44);\n        MEMFS.doesNotExistError.stack = '<generic error, no stack>';\n      }\n      throw MEMFS.doesNotExistError;\n    },\n    mknod(parent, name, mode, dev) {\n      return MEMFS.createNode(parent, name, mode, dev);\n    },\n    rename(old_node, new_dir, new_name) {\n      var new_node;\n      try {\n        new_node = FS.lookupNode(new_dir, new_name);\n      } catch (e) {}\n      if (new_node) {\n        if (FS.isDir(old_node.mode)) {\n          for (var i in new_node.contents) {\n            throw new FS.ErrnoError(55);\n          }\n        }\n        FS.hashRemoveNode(new_node);\n      }\n      delete old_node.parent.contents[old_node.name];\n      new_dir.contents[new_name] = old_node;\n      old_node.name = new_name;\n      new_dir.ctime =\n        new_dir.mtime =\n        old_node.parent.ctime =\n        old_node.parent.mtime =\n          Date.now();\n    },\n    unlink(parent, name) {\n      delete parent.contents[name];\n      parent.ctime = parent.mtime = Date.now();\n    },\n    rmdir(parent, name) {\n      var node = FS.lookupNode(parent, name);\n      for (var i in node.contents) {\n        throw new FS.ErrnoError(55);\n      }\n      delete parent.contents[name];\n      parent.ctime = parent.mtime = Date.now();\n    },\n    readdir(node) {\n      return ['.', '..', ...Object.keys(node.contents)];\n    },\n    symlink(parent, newname, oldpath) {\n      var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);\n      node.link = oldpath;\n      return node;\n    },\n    readlink(node) {\n      if (!FS.isLink(node.mode)) {\n        throw new FS.ErrnoError(28);\n      }\n      return node.link;\n    },\n  },\n  stream_ops: {\n    read(stream, buffer, offset, length, position) {\n      var contents = stream.node.contents;\n      if (position >= stream.node.usedBytes) return 0;\n      var size = Math.min(stream.node.usedBytes - position, length);\n      if (size > 8 && contents.subarray) {\n        buffer.set(contents.subarray(position, position + size), offset);\n      } else {\n        for (var i = 0; i < size; i++)\n          buffer[offset + i] = contents[position + i];\n      }\n      return size;\n    },\n    write(stream, buffer, offset, length, position, canOwn) {\n      if (buffer.buffer === HEAP8.buffer) {\n        canOwn = false;\n      }\n      if (!length) return 0;\n      var node = stream.node;\n      node.mtime = node.ctime = Date.now();\n      if (buffer.subarray && (!node.contents || node.contents.subarray)) {\n        if (canOwn) {\n          node.contents = buffer.subarray(offset, offset + length);\n          node.usedBytes = length;\n          return length;\n        } else if (node.usedBytes === 0 && position === 0) {\n          node.contents = buffer.slice(offset, offset + length);\n          node.usedBytes = length;\n          return length;\n        } else if (position + length <= node.usedBytes) {\n          node.contents.set(buffer.subarray(offset, offset + length), position);\n          return length;\n        }\n      }\n      MEMFS.expandFileStorage(node, position + length);\n      if (node.contents.subarray && buffer.subarray) {\n        node.contents.set(buffer.subarray(offset, offset + length), position);\n      } else {\n        for (var i = 0; i < length; i++) {\n          node.contents[position + i] = buffer[offset + i];\n        }\n      }\n      node.usedBytes = Math.max(node.usedBytes, position + length);\n      return length;\n    },\n    llseek(stream, offset, whence) {\n      var position = offset;\n      if (whence === 1) {\n        position += stream.position;\n      } else if (whence === 2) {\n        if (FS.isFile(stream.node.mode)) {\n          position += stream.node.usedBytes;\n        }\n      }\n      if (position < 0) {\n        throw new FS.ErrnoError(28);\n      }\n      return position;\n    },\n    mmap(stream, length, position, prot, flags) {\n      if (!FS.isFile(stream.node.mode)) {\n        throw new FS.ErrnoError(43);\n      }\n      var ptr;\n      var allocated;\n      var contents = stream.node.contents;\n      if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {\n        allocated = false;\n        ptr = contents.byteOffset;\n      } else {\n        allocated = true;\n        ptr = mmapAlloc(length);\n        if (!ptr) {\n          throw new FS.ErrnoError(48);\n        }\n        if (contents) {\n          if (position > 0 || position + length < contents.length) {\n            if (contents.subarray) {\n              contents = contents.subarray(position, position + length);\n            } else {\n              contents = Array.prototype.slice.call(\n                contents,\n                position,\n                position + length\n              );\n            }\n          }\n          HEAP8.set(contents, ptr >>> 0);\n        }\n      }\n      return { ptr, allocated };\n    },\n    msync(stream, buffer, offset, length, mmapFlags) {\n      MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);\n      return 0;\n    },\n  },\n};\nvar FS_modeStringToFlags = (str) => {\n  var flagModes = {\n    r: 0,\n    'r+': 2,\n    w: 512 | 64 | 1,\n    'w+': 512 | 64 | 2,\n    a: 1024 | 64 | 1,\n    'a+': 1024 | 64 | 2,\n  };\n  var flags = flagModes[str];\n  if (typeof flags == 'undefined') {\n    throw new Error(`Unknown file open mode: ${str}`);\n  }\n  return flags;\n};\nvar FS_getMode = (canRead, canWrite) => {\n  var mode = 0;\n  if (canRead) mode |= 292 | 73;\n  if (canWrite) mode |= 146;\n  return mode;\n};\nvar asyncLoad = async (url) => {\n  var arrayBuffer = await readAsync(url);\n  return new Uint8Array(arrayBuffer);\n};\nvar FS_createDataFile = (...args) => FS.createDataFile(...args);\nvar getUniqueRunDependency = (id) => id;\nvar preloadPlugins = [];\nvar FS_handledByPreloadPlugin = async (byteArray, fullname) => {\n  if (typeof Browser != 'undefined') Browser.init();\n  for (var plugin of preloadPlugins) {\n    if (plugin['canHandle'](fullname)) {\n      return plugin['handle'](byteArray, fullname);\n    }\n  }\n  return byteArray;\n};\nvar FS_preloadFile = async (\n  parent,\n  name,\n  url,\n  canRead,\n  canWrite,\n  dontCreateFile,\n  canOwn,\n  preFinish\n) => {\n  var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;\n  var dep = getUniqueRunDependency(`cp ${fullname}`);\n  addRunDependency(dep);\n  try {\n    var byteArray = url;\n    if (typeof url == 'string') {\n      byteArray = await asyncLoad(url);\n    }\n    byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);\n    preFinish?.();\n    if (!dontCreateFile) {\n      FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);\n    }\n  } finally {\n    removeRunDependency(dep);\n  }\n};\nvar FS_createPreloadedFile = (\n  parent,\n  name,\n  url,\n  canRead,\n  canWrite,\n  onload,\n  onerror,\n  dontCreateFile,\n  canOwn,\n  preFinish\n) => {\n  FS_preloadFile(\n    parent,\n    name,\n    url,\n    canRead,\n    canWrite,\n    dontCreateFile,\n    canOwn,\n    preFinish\n  )\n    .then(onload)\n    .catch(onerror);\n};\nvar FS = {\n  root: null,\n  mounts: [],\n  devices: {},\n  streams: [],\n  nextInode: 1,\n  nameTable: null,\n  currentPath: '/',\n  initialized: false,\n  ignorePermissions: true,\n  filesystems: null,\n  syncFSRequests: 0,\n  readFiles: {},\n  ErrnoError: class {\n    name = 'ErrnoError';\n    constructor(errno) {\n      this.errno = errno;\n    }\n  },\n  FSStream: class {\n    shared = {};\n    get object() {\n      return this.node;\n    }\n    set object(val) {\n      this.node = val;\n    }\n    get isRead() {\n      return (this.flags & 2097155) !== 1;\n    }\n    get isWrite() {\n      return (this.flags & 2097155) !== 0;\n    }\n    get isAppend() {\n      return this.flags & 1024;\n    }\n    get flags() {\n      return this.shared.flags;\n    }\n    set flags(val) {\n      this.shared.flags = val;\n    }\n    get position() {\n      return this.shared.position;\n    }\n    set position(val) {\n      this.shared.position = val;\n    }\n  },\n  FSNode: class {\n    node_ops = {};\n    stream_ops = {};\n    readMode = 292 | 73;\n    writeMode = 146;\n    mounted = null;\n    constructor(parent, name, mode, rdev) {\n      if (!parent) {\n        parent = this;\n      }\n      this.parent = parent;\n      this.mount = parent.mount;\n      this.id = FS.nextInode++;\n      this.name = name;\n      this.mode = mode;\n      this.rdev = rdev;\n      this.atime = this.mtime = this.ctime = Date.now();\n    }\n    get read() {\n      return (this.mode & this.readMode) === this.readMode;\n    }\n    set read(val) {\n      val ? (this.mode |= this.readMode) : (this.mode &= ~this.readMode);\n    }\n    get write() {\n      return (this.mode & this.writeMode) === this.writeMode;\n    }\n    set write(val) {\n      val ? (this.mode |= this.writeMode) : (this.mode &= ~this.writeMode);\n    }\n    get isFolder() {\n      return FS.isDir(this.mode);\n    }\n    get isDevice() {\n      return FS.isChrdev(this.mode);\n    }\n  },\n  lookupPath(path, opts = {}) {\n    if (!path) {\n      throw new FS.ErrnoError(44);\n    }\n    opts.follow_mount ??= true;\n    if (!PATH.isAbs(path)) {\n      path = FS.cwd() + '/' + path;\n    }\n    linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {\n      var parts = path.split('/').filter((p) => !!p);\n      var current = FS.root;\n      var current_path = '/';\n      for (var i = 0; i < parts.length; i++) {\n        var islast = i === parts.length - 1;\n        if (islast && opts.parent) {\n          break;\n        }\n        if (parts[i] === '.') {\n          continue;\n        }\n        if (parts[i] === '..') {\n          current_path = PATH.dirname(current_path);\n          if (FS.isRoot(current)) {\n            path = current_path + '/' + parts.slice(i + 1).join('/');\n            nlinks--;\n            continue linkloop;\n          } else {\n            current = current.parent;\n          }\n          continue;\n        }\n        current_path = PATH.join2(current_path, parts[i]);\n        try {\n          current = FS.lookupNode(current, parts[i]);\n        } catch (e) {\n          if (e?.errno === 44 && islast && opts.noent_okay) {\n            return { path: current_path };\n          }\n          throw e;\n        }\n        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {\n          current = current.mounted.root;\n        }\n        if (FS.isLink(current.mode) && (!islast || opts.follow)) {\n          if (!current.node_ops.readlink) {\n            throw new FS.ErrnoError(52);\n          }\n          var link = current.node_ops.readlink(current);\n          if (!PATH.isAbs(link)) {\n            link = PATH.dirname(current_path) + '/' + link;\n          }\n          path = link + '/' + parts.slice(i + 1).join('/');\n          continue linkloop;\n        }\n      }\n      return { path: current_path, node: current };\n    }\n    throw new FS.ErrnoError(32);\n  },\n  getPath(node) {\n    var path;\n    while (true) {\n      if (FS.isRoot(node)) {\n        var mount = node.mount.mountpoint;\n        if (!path) return mount;\n        return mount[mount.length - 1] !== '/'\n          ? `${mount}/${path}`\n          : mount + path;\n      }\n      path = path ? `${node.name}/${path}` : node.name;\n      node = node.parent;\n    }\n  },\n  hashName(parentid, name) {\n    var hash = 0;\n    for (var i = 0; i < name.length; i++) {\n      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;\n    }\n    return ((parentid + hash) >>> 0) % FS.nameTable.length;\n  },\n  hashAddNode(node) {\n    var hash = FS.hashName(node.parent.id, node.name);\n    node.name_next = FS.nameTable[hash];\n    FS.nameTable[hash] = node;\n  },\n  hashRemoveNode(node) {\n    var hash = FS.hashName(node.parent.id, node.name);\n    if (FS.nameTable[hash] === node) {\n      FS.nameTable[hash] = node.name_next;\n    } else {\n      var current = FS.nameTable[hash];\n      while (current) {\n        if (current.name_next === node) {\n          current.name_next = node.name_next;\n          break;\n        }\n        current = current.name_next;\n      }\n    }\n  },\n  lookupNode(parent, name) {\n    var errCode = FS.mayLookup(parent);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    var hash = FS.hashName(parent.id, name);\n    for (var node = FS.nameTable[hash]; node; node = node.name_next) {\n      var nodeName = node.name;\n      if (node.parent.id === parent.id && nodeName === name) {\n        return node;\n      }\n    }\n    return FS.lookup(parent, name);\n  },\n  createNode(parent, name, mode, rdev) {\n    var node = new FS.FSNode(parent, name, mode, rdev);\n    FS.hashAddNode(node);\n    return node;\n  },\n  destroyNode(node) {\n    FS.hashRemoveNode(node);\n  },\n  isRoot(node) {\n    return node === node.parent;\n  },\n  isMountpoint(node) {\n    return !!node.mounted;\n  },\n  isFile(mode) {\n    return (mode & 61440) === 32768;\n  },\n  isDir(mode) {\n    return (mode & 61440) === 16384;\n  },\n  isLink(mode) {\n    return (mode & 61440) === 40960;\n  },\n  isChrdev(mode) {\n    return (mode & 61440) === 8192;\n  },\n  isBlkdev(mode) {\n    return (mode & 61440) === 24576;\n  },\n  isFIFO(mode) {\n    return (mode & 61440) === 4096;\n  },\n  isSocket(mode) {\n    return (mode & 49152) === 49152;\n  },\n  flagsToPermissionString(flag) {\n    var perms = ['r', 'w', 'rw'][flag & 3];\n    if (flag & 512) {\n      perms += 'w';\n    }\n    return perms;\n  },\n  nodePermissions(node, perms) {\n    if (FS.ignorePermissions) {\n      return 0;\n    }\n    if (perms.includes('r') && !(node.mode & 292)) {\n      return 2;\n    } else if (perms.includes('w') && !(node.mode & 146)) {\n      return 2;\n    } else if (perms.includes('x') && !(node.mode & 73)) {\n      return 2;\n    }\n    return 0;\n  },\n  mayLookup(dir) {\n    if (!FS.isDir(dir.mode)) return 54;\n    var errCode = FS.nodePermissions(dir, 'x');\n    if (errCode) return errCode;\n    if (!dir.node_ops.lookup) return 2;\n    return 0;\n  },\n  mayCreate(dir, name) {\n    if (!FS.isDir(dir.mode)) {\n      return 54;\n    }\n    try {\n      var node = FS.lookupNode(dir, name);\n      return 20;\n    } catch (e) {}\n    return FS.nodePermissions(dir, 'wx');\n  },\n  mayDelete(dir, name, isdir) {\n    var node;\n    try {\n      node = FS.lookupNode(dir, name);\n    } catch (e) {\n      return e.errno;\n    }\n    var errCode = FS.nodePermissions(dir, 'wx');\n    if (errCode) {\n      return errCode;\n    }\n    if (isdir) {\n      if (!FS.isDir(node.mode)) {\n        return 54;\n      }\n      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {\n        return 10;\n      }\n    } else {\n      if (FS.isDir(node.mode)) {\n        return 31;\n      }\n    }\n    return 0;\n  },\n  mayOpen(node, flags) {\n    if (!node) {\n      return 44;\n    }\n    if (FS.isLink(node.mode)) {\n      return 32;\n    } else if (FS.isDir(node.mode)) {\n      if (FS.flagsToPermissionString(flags) !== 'r' || flags & (512 | 64)) {\n        return 31;\n      }\n    }\n    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));\n  },\n  checkOpExists(op, err) {\n    if (!op) {\n      throw new FS.ErrnoError(err);\n    }\n    return op;\n  },\n  MAX_OPEN_FDS: 4096,\n  nextfd() {\n    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {\n      if (!FS.streams[fd]) {\n        return fd;\n      }\n    }\n    throw new FS.ErrnoError(33);\n  },\n  getStreamChecked(fd) {\n    var stream = FS.getStream(fd);\n    if (!stream) {\n      throw new FS.ErrnoError(8);\n    }\n    return stream;\n  },\n  getStream: (fd) => FS.streams[fd],\n  createStream(stream, fd = -1) {\n    stream = Object.assign(new FS.FSStream(), stream);\n    if (fd == -1) {\n      fd = FS.nextfd();\n    }\n    stream.fd = fd;\n    FS.streams[fd] = stream;\n    return stream;\n  },\n  closeStream(fd) {\n    FS.streams[fd] = null;\n  },\n  dupStream(origStream, fd = -1) {\n    var stream = FS.createStream(origStream, fd);\n    stream.stream_ops?.dup?.(stream);\n    return stream;\n  },\n  doSetAttr(stream, node, attr) {\n    var setattr = stream?.stream_ops.setattr;\n    var arg = setattr ? stream : node;\n    setattr ??= node.node_ops.setattr;\n    FS.checkOpExists(setattr, 63);\n    setattr(arg, attr);\n  },\n  chrdev_stream_ops: {\n    open(stream) {\n      var device = FS.getDevice(stream.node.rdev);\n      stream.stream_ops = device.stream_ops;\n      stream.stream_ops.open?.(stream);\n    },\n    llseek() {\n      throw new FS.ErrnoError(70);\n    },\n  },\n  major: (dev) => dev >> 8,\n  minor: (dev) => dev & 255,\n  makedev: (ma, mi) => (ma << 8) | mi,\n  registerDevice(dev, ops) {\n    FS.devices[dev] = { stream_ops: ops };\n  },\n  getDevice: (dev) => FS.devices[dev],\n  getMounts(mount) {\n    var mounts = [];\n    var check = [mount];\n    while (check.length) {\n      var m = check.pop();\n      mounts.push(m);\n      check.push(...m.mounts);\n    }\n    return mounts;\n  },\n  syncfs(populate, callback) {\n    if (typeof populate == 'function') {\n      callback = populate;\n      populate = false;\n    }\n    FS.syncFSRequests++;\n    if (FS.syncFSRequests > 1) {\n      err(\n        `warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`\n      );\n    }\n    var mounts = FS.getMounts(FS.root.mount);\n    var completed = 0;\n    function doCallback(errCode) {\n      FS.syncFSRequests--;\n      return callback(errCode);\n    }\n    function done(errCode) {\n      if (errCode) {\n        if (!done.errored) {\n          done.errored = true;\n          return doCallback(errCode);\n        }\n        return;\n      }\n      if (++completed >= mounts.length) {\n        doCallback(null);\n      }\n    }\n    for (var mount of mounts) {\n      if (mount.type.syncfs) {\n        mount.type.syncfs(mount, populate, done);\n      } else {\n        done(null);\n      }\n    }\n  },\n  mount(type, opts, mountpoint) {\n    var root = mountpoint === '/';\n    var pseudo = !mountpoint;\n    var node;\n    if (root && FS.root) {\n      throw new FS.ErrnoError(10);\n    } else if (!root && !pseudo) {\n      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });\n      mountpoint = lookup.path;\n      node = lookup.node;\n      if (FS.isMountpoint(node)) {\n        throw new FS.ErrnoError(10);\n      }\n      if (!FS.isDir(node.mode)) {\n        throw new FS.ErrnoError(54);\n      }\n    }\n    var mount = { type, opts, mountpoint, mounts: [] };\n    var mountRoot = type.mount(mount);\n    mountRoot.mount = mount;\n    mount.root = mountRoot;\n    if (root) {\n      FS.root = mountRoot;\n    } else if (node) {\n      node.mounted = mount;\n      if (node.mount) {\n        node.mount.mounts.push(mount);\n      }\n    }\n    return mountRoot;\n  },\n  unmount(mountpoint) {\n    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });\n    if (!FS.isMountpoint(lookup.node)) {\n      throw new FS.ErrnoError(28);\n    }\n    var node = lookup.node;\n    var mount = node.mounted;\n    var mounts = FS.getMounts(mount);\n    for (var [hash, current] of Object.entries(FS.nameTable)) {\n      while (current) {\n        var next = current.name_next;\n        if (mounts.includes(current.mount)) {\n          FS.destroyNode(current);\n        }\n        current = next;\n      }\n    }\n    node.mounted = null;\n    var idx = node.mount.mounts.indexOf(mount);\n    node.mount.mounts.splice(idx, 1);\n  },\n  lookup(parent, name) {\n    return parent.node_ops.lookup(parent, name);\n  },\n  mknod(path, mode, dev) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    var name = PATH.basename(path);\n    if (!name) {\n      throw new FS.ErrnoError(28);\n    }\n    if (name === '.' || name === '..') {\n      throw new FS.ErrnoError(20);\n    }\n    var errCode = FS.mayCreate(parent, name);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.mknod) {\n      throw new FS.ErrnoError(63);\n    }\n    return parent.node_ops.mknod(parent, name, mode, dev);\n  },\n  statfs(path) {\n    return FS.statfsNode(FS.lookupPath(path, { follow: true }).node);\n  },\n  statfsStream(stream) {\n    return FS.statfsNode(stream.node);\n  },\n  statfsNode(node) {\n    var rtn = {\n      bsize: 4096,\n      frsize: 4096,\n      blocks: 1e6,\n      bfree: 5e5,\n      bavail: 5e5,\n      files: FS.nextInode,\n      ffree: FS.nextInode - 1,\n      fsid: 42,\n      flags: 2,\n      namelen: 255,\n    };\n    if (node.node_ops.statfs) {\n      Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));\n    }\n    return rtn;\n  },\n  create(path, mode = 438) {\n    mode &= 4095;\n    mode |= 32768;\n    return FS.mknod(path, mode, 0);\n  },\n  mkdir(path, mode = 511) {\n    mode &= 511 | 512;\n    mode |= 16384;\n    return FS.mknod(path, mode, 0);\n  },\n  mkdirTree(path, mode) {\n    var dirs = path.split('/');\n    var d = '';\n    for (var dir of dirs) {\n      if (!dir) continue;\n      if (d || PATH.isAbs(path)) d += '/';\n      d += dir;\n      try {\n        FS.mkdir(d, mode);\n      } catch (e) {\n        if (e.errno != 20) throw e;\n      }\n    }\n  },\n  mkdev(path, mode, dev) {\n    if (typeof dev == 'undefined') {\n      dev = mode;\n      mode = 438;\n    }\n    mode |= 8192;\n    return FS.mknod(path, mode, dev);\n  },\n  symlink(oldpath, newpath) {\n    if (!PATH_FS.resolve(oldpath)) {\n      throw new FS.ErrnoError(44);\n    }\n    var lookup = FS.lookupPath(newpath, { parent: true });\n    var parent = lookup.node;\n    if (!parent) {\n      throw new FS.ErrnoError(44);\n    }\n    var newname = PATH.basename(newpath);\n    var errCode = FS.mayCreate(parent, newname);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.symlink) {\n      throw new FS.ErrnoError(63);\n    }\n    return parent.node_ops.symlink(parent, newname, oldpath);\n  },\n  rename(old_path, new_path) {\n    var old_dirname = PATH.dirname(old_path);\n    var new_dirname = PATH.dirname(new_path);\n    var old_name = PATH.basename(old_path);\n    var new_name = PATH.basename(new_path);\n    var lookup, old_dir, new_dir;\n    lookup = FS.lookupPath(old_path, { parent: true });\n    old_dir = lookup.node;\n    lookup = FS.lookupPath(new_path, { parent: true });\n    new_dir = lookup.node;\n    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);\n    if (old_dir.mount !== new_dir.mount) {\n      throw new FS.ErrnoError(75);\n    }\n    var old_node = FS.lookupNode(old_dir, old_name);\n    var relative = PATH_FS.relative(old_path, new_dirname);\n    if (relative.charAt(0) !== '.') {\n      throw new FS.ErrnoError(28);\n    }\n    relative = PATH_FS.relative(new_path, old_dirname);\n    if (relative.charAt(0) !== '.') {\n      throw new FS.ErrnoError(55);\n    }\n    var new_node;\n    try {\n      new_node = FS.lookupNode(new_dir, new_name);\n    } catch (e) {}\n    if (old_node === new_node) {\n      return;\n    }\n    var isdir = FS.isDir(old_node.mode);\n    var errCode = FS.mayDelete(old_dir, old_name, isdir);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    errCode = new_node\n      ? FS.mayDelete(new_dir, new_name, isdir)\n      : FS.mayCreate(new_dir, new_name);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!old_dir.node_ops.rename) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {\n      throw new FS.ErrnoError(10);\n    }\n    if (new_dir !== old_dir) {\n      errCode = FS.nodePermissions(old_dir, 'w');\n      if (errCode) {\n        throw new FS.ErrnoError(errCode);\n      }\n    }\n    FS.hashRemoveNode(old_node);\n    try {\n      old_dir.node_ops.rename(old_node, new_dir, new_name);\n      old_node.parent = new_dir;\n    } catch (e) {\n      throw e;\n    } finally {\n      FS.hashAddNode(old_node);\n    }\n  },\n  rmdir(path) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    var name = PATH.basename(path);\n    var node = FS.lookupNode(parent, name);\n    var errCode = FS.mayDelete(parent, name, true);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.rmdir) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(node)) {\n      throw new FS.ErrnoError(10);\n    }\n    parent.node_ops.rmdir(parent, name);\n    FS.destroyNode(node);\n  },\n  readdir(path) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    var node = lookup.node;\n    var readdir = FS.checkOpExists(node.node_ops.readdir, 54);\n    return readdir(node);\n  },\n  unlink(path) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    if (!parent) {\n      throw new FS.ErrnoError(44);\n    }\n    var name = PATH.basename(path);\n    var node = FS.lookupNode(parent, name);\n    var errCode = FS.mayDelete(parent, name, false);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.unlink) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(node)) {\n      throw new FS.ErrnoError(10);\n    }\n    parent.node_ops.unlink(parent, name);\n    FS.destroyNode(node);\n  },\n  readlink(path) {\n    var lookup = FS.lookupPath(path);\n    var link = lookup.node;\n    if (!link) {\n      throw new FS.ErrnoError(44);\n    }\n    if (!link.node_ops.readlink) {\n      throw new FS.ErrnoError(28);\n    }\n    return link.node_ops.readlink(link);\n  },\n  stat(path, dontFollow) {\n    var lookup = FS.lookupPath(path, { follow: !dontFollow });\n    var node = lookup.node;\n    var getattr = FS.checkOpExists(node.node_ops.getattr, 63);\n    return getattr(node);\n  },\n  fstat(fd) {\n    var stream = FS.getStreamChecked(fd);\n    var node = stream.node;\n    var getattr = stream.stream_ops.getattr;\n    var arg = getattr ? stream : node;\n    getattr ??= node.node_ops.getattr;\n    FS.checkOpExists(getattr, 63);\n    return getattr(arg);\n  },\n  lstat(path) {\n    return FS.stat(path, true);\n  },\n  doChmod(stream, node, mode, dontFollow) {\n    FS.doSetAttr(stream, node, {\n      mode: (mode & 4095) | (node.mode & ~4095),\n      ctime: Date.now(),\n      dontFollow,\n    });\n  },\n  chmod(path, mode, dontFollow) {\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: !dontFollow });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doChmod(null, node, mode, dontFollow);\n  },\n  lchmod(path, mode) {\n    FS.chmod(path, mode, true);\n  },\n  fchmod(fd, mode) {\n    var stream = FS.getStreamChecked(fd);\n    FS.doChmod(stream, stream.node, mode, false);\n  },\n  doChown(stream, node, dontFollow) {\n    FS.doSetAttr(stream, node, { timestamp: Date.now(), dontFollow });\n  },\n  chown(path, uid, gid, dontFollow) {\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: !dontFollow });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doChown(null, node, dontFollow);\n  },\n  lchown(path, uid, gid) {\n    FS.chown(path, uid, gid, true);\n  },\n  fchown(fd, uid, gid) {\n    var stream = FS.getStreamChecked(fd);\n    FS.doChown(stream, stream.node, false);\n  },\n  doTruncate(stream, node, len) {\n    if (FS.isDir(node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!FS.isFile(node.mode)) {\n      throw new FS.ErrnoError(28);\n    }\n    var errCode = FS.nodePermissions(node, 'w');\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    FS.doSetAttr(stream, node, { size: len, timestamp: Date.now() });\n  },\n  truncate(path, len) {\n    if (len < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: true });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doTruncate(null, node, len);\n  },\n  ftruncate(fd, len) {\n    var stream = FS.getStreamChecked(fd);\n    if (len < 0 || (stream.flags & 2097155) === 0) {\n      throw new FS.ErrnoError(28);\n    }\n    FS.doTruncate(stream, stream.node, len);\n  },\n  utime(path, atime, mtime) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    var node = lookup.node;\n    var setattr = FS.checkOpExists(node.node_ops.setattr, 63);\n    setattr(node, { atime, mtime });\n  },\n  open(path, flags, mode = 438) {\n    if (path === '') {\n      throw new FS.ErrnoError(44);\n    }\n    flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;\n    if (flags & 64) {\n      mode = (mode & 4095) | 32768;\n    } else {\n      mode = 0;\n    }\n    var node;\n    var isDirPath;\n    if (typeof path == 'object') {\n      node = path;\n    } else {\n      isDirPath = path.endsWith('/');\n      var lookup = FS.lookupPath(path, {\n        follow: !(flags & 131072),\n        noent_okay: true,\n      });\n      node = lookup.node;\n      path = lookup.path;\n    }\n    var created = false;\n    if (flags & 64) {\n      if (node) {\n        if (flags & 128) {\n          throw new FS.ErrnoError(20);\n        }\n      } else if (isDirPath) {\n        throw new FS.ErrnoError(31);\n      } else {\n        node = FS.mknod(path, mode | 511, 0);\n        created = true;\n      }\n    }\n    if (!node) {\n      throw new FS.ErrnoError(44);\n    }\n    if (FS.isChrdev(node.mode)) {\n      flags &= ~512;\n    }\n    if (flags & 65536 && !FS.isDir(node.mode)) {\n      throw new FS.ErrnoError(54);\n    }\n    if (!created) {\n      var errCode = FS.mayOpen(node, flags);\n      if (errCode) {\n        throw new FS.ErrnoError(errCode);\n      }\n    }\n    if (flags & 512 && !created) {\n      FS.truncate(node, 0);\n    }\n    flags &= ~(128 | 512 | 131072);\n    var stream = FS.createStream({\n      node,\n      path: FS.getPath(node),\n      flags,\n      seekable: true,\n      position: 0,\n      stream_ops: node.stream_ops,\n      ungotten: [],\n      error: false,\n    });\n    if (stream.stream_ops.open) {\n      stream.stream_ops.open(stream);\n    }\n    if (created) {\n      FS.chmod(node, mode & 511);\n    }\n    if (Module['logReadFiles'] && !(flags & 1)) {\n      if (!(path in FS.readFiles)) {\n        FS.readFiles[path] = 1;\n      }\n    }\n    return stream;\n  },\n  close(stream) {\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if (stream.getdents) stream.getdents = null;\n    try {\n      if (stream.stream_ops.close) {\n        stream.stream_ops.close(stream);\n      }\n    } catch (e) {\n      throw e;\n    } finally {\n      FS.closeStream(stream.fd);\n    }\n    stream.fd = null;\n  },\n  isClosed(stream) {\n    return stream.fd === null;\n  },\n  llseek(stream, offset, whence) {\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if (!stream.seekable || !stream.stream_ops.llseek) {\n      throw new FS.ErrnoError(70);\n    }\n    if (whence != 0 && whence != 1 && whence != 2) {\n      throw new FS.ErrnoError(28);\n    }\n    stream.position = stream.stream_ops.llseek(stream, offset, whence);\n    stream.ungotten = [];\n    return stream.position;\n  },\n  read(stream, buffer, offset, length, position) {\n    if (length < 0 || position < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if ((stream.flags & 2097155) === 1) {\n      throw new FS.ErrnoError(8);\n    }\n    if (FS.isDir(stream.node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!stream.stream_ops.read) {\n      throw new FS.ErrnoError(28);\n    }\n    var seeking = typeof position != 'undefined';\n    if (!seeking) {\n      position = stream.position;\n    } else if (!stream.seekable) {\n      throw new FS.ErrnoError(70);\n    }\n    var bytesRead = stream.stream_ops.read(\n      stream,\n      buffer,\n      offset,\n      length,\n      position\n    );\n    if (!seeking) stream.position += bytesRead;\n    return bytesRead;\n  },\n  write(stream, buffer, offset, length, position, canOwn) {\n    if (length < 0 || position < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if ((stream.flags & 2097155) === 0) {\n      throw new FS.ErrnoError(8);\n    }\n    if (FS.isDir(stream.node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!stream.stream_ops.write) {\n      throw new FS.ErrnoError(28);\n    }\n    if (stream.seekable && stream.flags & 1024) {\n      FS.llseek(stream, 0, 2);\n    }\n    var seeking = typeof position != 'undefined';\n    if (!seeking) {\n      position = stream.position;\n    } else if (!stream.seekable) {\n      throw new FS.ErrnoError(70);\n    }\n    var bytesWritten = stream.stream_ops.write(\n      stream,\n      buffer,\n      offset,\n      length,\n      position,\n      canOwn\n    );\n    if (!seeking) stream.position += bytesWritten;\n    return bytesWritten;\n  },\n  mmap(stream, length, position, prot, flags) {\n    if (\n      (prot & 2) !== 0 &&\n      (flags & 2) === 0 &&\n      (stream.flags & 2097155) !== 2\n    ) {\n      throw new FS.ErrnoError(2);\n    }\n    if ((stream.flags & 2097155) === 1) {\n      throw new FS.ErrnoError(2);\n    }\n    if (!stream.stream_ops.mmap) {\n      throw new FS.ErrnoError(43);\n    }\n    if (!length) {\n      throw new FS.ErrnoError(28);\n    }\n    return stream.stream_ops.mmap(stream, length, position, prot, flags);\n  },\n  msync(stream, buffer, offset, length, mmapFlags) {\n    if (!stream.stream_ops.msync) {\n      return 0;\n    }\n    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);\n  },\n  ioctl(stream, cmd, arg) {\n    if (!stream.stream_ops.ioctl) {\n      throw new FS.ErrnoError(59);\n    }\n    return stream.stream_ops.ioctl(stream, cmd, arg);\n  },\n  readFile(path, opts = {}) {\n    opts.flags = opts.flags || 0;\n    opts.encoding = opts.encoding || 'binary';\n    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {\n      abort(`Invalid encoding type \"${opts.encoding}\"`);\n    }\n    var stream = FS.open(path, opts.flags);\n    var stat = FS.stat(path);\n    var length = stat.size;\n    var buf = new Uint8Array(length);\n    FS.read(stream, buf, 0, length, 0);\n    if (opts.encoding === 'utf8') {\n      buf = UTF8ArrayToString(buf);\n    }\n    FS.close(stream);\n    return buf;\n  },\n  writeFile(path, data, opts = {}) {\n    opts.flags = opts.flags || 577;\n    var stream = FS.open(path, opts.flags, opts.mode);\n    if (typeof data == 'string') {\n      data = new Uint8Array(intArrayFromString(data, true));\n    }\n    if (ArrayBuffer.isView(data)) {\n      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);\n    } else {\n      abort('Unsupported data type');\n    }\n    FS.close(stream);\n  },\n  cwd: () => FS.currentPath,\n  chdir(path) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    if (lookup.node === null) {\n      throw new FS.ErrnoError(44);\n    }\n    if (!FS.isDir(lookup.node.mode)) {\n      throw new FS.ErrnoError(54);\n    }\n    var errCode = FS.nodePermissions(lookup.node, 'x');\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    FS.currentPath = lookup.path;\n  },\n  createDefaultDirectories() {\n    FS.mkdir('/tmp');\n    FS.mkdir('/home');\n    FS.mkdir('/home/web_user');\n  },\n  createDefaultDevices() {\n    FS.mkdir('/dev');\n    FS.registerDevice(FS.makedev(1, 3), {\n      read: () => 0,\n      write: (stream, buffer, offset, length, pos) => length,\n      llseek: () => 0,\n    });\n    FS.mkdev('/dev/null', FS.makedev(1, 3));\n    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);\n    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);\n    FS.mkdev('/dev/tty', FS.makedev(5, 0));\n    FS.mkdev('/dev/tty1', FS.makedev(6, 0));\n    var randomBuffer = new Uint8Array(1024),\n      randomLeft = 0;\n    var randomByte = () => {\n      if (randomLeft === 0) {\n        randomFill(randomBuffer);\n        randomLeft = randomBuffer.byteLength;\n      }\n      return randomBuffer[--randomLeft];\n    };\n    FS.createDevice('/dev', 'random', randomByte);\n    FS.createDevice('/dev', 'urandom', randomByte);\n    FS.mkdir('/dev/shm');\n    FS.mkdir('/dev/shm/tmp');\n  },\n  createSpecialDirectories() {\n    FS.mkdir('/proc');\n    var proc_self = FS.mkdir('/proc/self');\n    FS.mkdir('/proc/self/fd');\n    FS.mount(\n      {\n        mount() {\n          var node = FS.createNode(proc_self, 'fd', 16895, 73);\n          node.stream_ops = { llseek: MEMFS.stream_ops.llseek };\n          node.node_ops = {\n            lookup(parent, name) {\n              var fd = +name;\n              var stream = FS.getStreamChecked(fd);\n              var ret = {\n                parent: null,\n                mount: { mountpoint: 'fake' },\n                node_ops: { readlink: () => stream.path },\n                id: fd + 1,\n              };\n              ret.parent = ret;\n              return ret;\n            },\n            readdir() {\n              return Array.from(FS.streams.entries())\n                .filter(([k, v]) => v)\n                .map(([k, v]) => k.toString());\n            },\n          };\n          return node;\n        },\n      },\n      {},\n      '/proc/self/fd'\n    );\n  },\n  createStandardStreams(input, output, error) {\n    if (input) {\n      FS.createDevice('/dev', 'stdin', input);\n    } else {\n      FS.symlink('/dev/tty', '/dev/stdin');\n    }\n    if (output) {\n      FS.createDevice('/dev', 'stdout', null, output);\n    } else {\n      FS.symlink('/dev/tty', '/dev/stdout');\n    }\n    if (error) {\n      FS.createDevice('/dev', 'stderr', null, error);\n    } else {\n      FS.symlink('/dev/tty1', '/dev/stderr');\n    }\n    var stdin = FS.open('/dev/stdin', 0);\n    var stdout = FS.open('/dev/stdout', 1);\n    var stderr = FS.open('/dev/stderr', 1);\n  },\n  staticInit() {\n    FS.nameTable = new Array(4096);\n    FS.mount(MEMFS, {}, '/');\n    FS.createDefaultDirectories();\n    FS.createDefaultDevices();\n    FS.createSpecialDirectories();\n    FS.filesystems = { MEMFS };\n  },\n  init(input, output, error) {\n    FS.initialized = true;\n    input ??= Module['stdin'];\n    output ??= Module['stdout'];\n    error ??= Module['stderr'];\n    FS.createStandardStreams(input, output, error);\n  },\n  quit() {\n    FS.initialized = false;\n    for (var stream of FS.streams) {\n      if (stream) {\n        FS.close(stream);\n      }\n    }\n  },\n  findObject(path, dontResolveLastLink) {\n    var ret = FS.analyzePath(path, dontResolveLastLink);\n    if (!ret.exists) {\n      return null;\n    }\n    return ret.object;\n  },\n  analyzePath(path, dontResolveLastLink) {\n    try {\n      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });\n      path = lookup.path;\n    } catch (e) {}\n    var ret = {\n      isRoot: false,\n      exists: false,\n      error: 0,\n      name: null,\n      path: null,\n      object: null,\n      parentExists: false,\n      parentPath: null,\n      parentObject: null,\n    };\n    try {\n      var lookup = FS.lookupPath(path, { parent: true });\n      ret.parentExists = true;\n      ret.parentPath = lookup.path;\n      ret.parentObject = lookup.node;\n      ret.name = PATH.basename(path);\n      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });\n      ret.exists = true;\n      ret.path = lookup.path;\n      ret.object = lookup.node;\n      ret.name = lookup.node.name;\n      ret.isRoot = lookup.path === '/';\n    } catch (e) {\n      ret.error = e.errno;\n    }\n    return ret;\n  },\n  createPath(parent, path, canRead, canWrite) {\n    parent = typeof parent == 'string' ? parent : FS.getPath(parent);\n    var parts = path.split('/').reverse();\n    while (parts.length) {\n      var part = parts.pop();\n      if (!part) continue;\n      var current = PATH.join2(parent, part);\n      try {\n        FS.mkdir(current);\n      } catch (e) {\n        if (e.errno != 20) throw e;\n      }\n      parent = current;\n    }\n    return current;\n  },\n  createFile(parent, name, properties, canRead, canWrite) {\n    var path = PATH.join2(\n      typeof parent == 'string' ? parent : FS.getPath(parent),\n      name\n    );\n    var mode = FS_getMode(canRead, canWrite);\n    return FS.create(path, mode);\n  },\n  createDataFile(parent, name, data, canRead, canWrite, canOwn) {\n    var path = name;\n    if (parent) {\n      parent = typeof parent == 'string' ? parent : FS.getPath(parent);\n      path = name ? PATH.join2(parent, name) : parent;\n    }\n    var mode = FS_getMode(canRead, canWrite);\n    var node = FS.create(path, mode);\n    if (data) {\n      if (typeof data == 'string') {\n        var arr = new Array(data.length);\n        for (var i = 0, len = data.length; i < len; ++i)\n          arr[i] = data.charCodeAt(i);\n        data = arr;\n      }\n      FS.chmod(node, mode | 146);\n      var stream = FS.open(node, 577);\n      FS.write(stream, data, 0, data.length, 0, canOwn);\n      FS.close(stream);\n      FS.chmod(node, mode);\n    }\n  },\n  createDevice(parent, name, input, output) {\n    var path = PATH.join2(\n      typeof parent == 'string' ? parent : FS.getPath(parent),\n      name\n    );\n    var mode = FS_getMode(!!input, !!output);\n    FS.createDevice.major ??= 64;\n    var dev = FS.makedev(FS.createDevice.major++, 0);\n    FS.registerDevice(dev, {\n      open(stream) {\n        stream.seekable = false;\n      },\n      close(stream) {\n        if (output?.buffer?.length) {\n          output(10);\n        }\n      },\n      read(stream, buffer, offset, length, pos) {\n        var bytesRead = 0;\n        for (var i = 0; i < length; i++) {\n          var result;\n          try {\n            result = input();\n          } catch (e) {\n            throw new FS.ErrnoError(29);\n          }\n          if (result === undefined && bytesRead === 0) {\n            throw new FS.ErrnoError(6);\n          }\n          if (result === null || result === undefined) break;\n          bytesRead++;\n          buffer[offset + i] = result;\n        }\n        if (bytesRead) {\n          stream.node.atime = Date.now();\n        }\n        return bytesRead;\n      },\n      write(stream, buffer, offset, length, pos) {\n        for (var i = 0; i < length; i++) {\n          try {\n            output(buffer[offset + i]);\n          } catch (e) {\n            throw new FS.ErrnoError(29);\n          }\n        }\n        if (length) {\n          stream.node.mtime = stream.node.ctime = Date.now();\n        }\n        return i;\n      },\n    });\n    return FS.mkdev(path, mode, dev);\n  },\n  forceLoadFile(obj) {\n    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;\n    if (globalThis.XMLHttpRequest) {\n      abort(\n        'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.'\n      );\n    } else {\n      try {\n        obj.contents = readBinary(obj.url);\n      } catch (e) {\n        throw new FS.ErrnoError(29);\n      }\n    }\n  },\n  createLazyFile(parent, name, url, canRead, canWrite) {\n    class LazyUint8Array {\n      lengthKnown = false;\n      chunks = [];\n      get(idx) {\n        if (idx > this.length - 1 || idx < 0) {\n          return undefined;\n        }\n        var chunkOffset = idx % this.chunkSize;\n        var chunkNum = (idx / this.chunkSize) | 0;\n        return this.getter(chunkNum)[chunkOffset];\n      }\n      setDataGetter(getter) {\n        this.getter = getter;\n      }\n      cacheLength() {\n        var xhr = new XMLHttpRequest();\n        xhr.open('HEAD', url, false);\n        xhr.send(null);\n        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))\n          abort(\"Couldn't load \" + url + '. Status: ' + xhr.status);\n        var datalength = Number(xhr.getResponseHeader('Content-length'));\n        var header;\n        var hasByteServing =\n          (header = xhr.getResponseHeader('Accept-Ranges')) &&\n          header === 'bytes';\n        var usesGzip =\n          (header = xhr.getResponseHeader('Content-Encoding')) &&\n          header === 'gzip';\n        var chunkSize = 1024 * 1024;\n        if (!hasByteServing) chunkSize = datalength;\n        var doXHR = (from, to) => {\n          if (from > to)\n            abort(\n              'invalid range (' + from + ', ' + to + ') or no bytes requested!'\n            );\n          if (to > datalength - 1)\n            abort('only ' + datalength + ' bytes available! programmer error!');\n          var xhr = new XMLHttpRequest();\n          xhr.open('GET', url, false);\n          if (datalength !== chunkSize)\n            xhr.setRequestHeader('Range', 'bytes=' + from + '-' + to);\n          xhr.responseType = 'arraybuffer';\n          if (xhr.overrideMimeType) {\n            xhr.overrideMimeType('text/plain; charset=x-user-defined');\n          }\n          xhr.send(null);\n          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))\n            abort(\"Couldn't load \" + url + '. Status: ' + xhr.status);\n          if (xhr.response !== undefined) {\n            return new Uint8Array(xhr.response || []);\n          }\n          return intArrayFromString(xhr.responseText || '', true);\n        };\n        var lazyArray = this;\n        lazyArray.setDataGetter((chunkNum) => {\n          var start = chunkNum * chunkSize;\n          var end = (chunkNum + 1) * chunkSize - 1;\n          end = Math.min(end, datalength - 1);\n          if (typeof lazyArray.chunks[chunkNum] == 'undefined') {\n            lazyArray.chunks[chunkNum] = doXHR(start, end);\n          }\n          if (typeof lazyArray.chunks[chunkNum] == 'undefined')\n            abort('doXHR failed!');\n          return lazyArray.chunks[chunkNum];\n        });\n        if (usesGzip || !datalength) {\n          chunkSize = datalength = 1;\n          datalength = this.getter(0).length;\n          chunkSize = datalength;\n          out(\n            'LazyFiles on gzip forces download of the whole file when length is accessed'\n          );\n        }\n        this._length = datalength;\n        this._chunkSize = chunkSize;\n        this.lengthKnown = true;\n      }\n      get length() {\n        if (!this.lengthKnown) {\n          this.cacheLength();\n        }\n        return this._length;\n      }\n      get chunkSize() {\n        if (!this.lengthKnown) {\n          this.cacheLength();\n        }\n        return this._chunkSize;\n      }\n    }\n    if (globalThis.XMLHttpRequest) {\n      if (!ENVIRONMENT_IS_WORKER)\n        abort(\n          'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc'\n        );\n      var lazyArray = new LazyUint8Array();\n      var properties = { isDevice: false, contents: lazyArray };\n    } else {\n      var properties = { isDevice: false, url };\n    }\n    var node = FS.createFile(parent, name, properties, canRead, canWrite);\n    if (properties.contents) {\n      node.contents = properties.contents;\n    } else if (properties.url) {\n      node.contents = null;\n      node.url = properties.url;\n    }\n    Object.defineProperties(node, {\n      usedBytes: {\n        get: function () {\n          return this.contents.length;\n        },\n      },\n    });\n    var stream_ops = {};\n    for (const [key, fn] of Object.entries(node.stream_ops)) {\n      stream_ops[key] = (...args) => {\n        FS.forceLoadFile(node);\n        return fn(...args);\n      };\n    }\n    function writeChunks(stream, buffer, offset, length, position) {\n      var contents = stream.node.contents;\n      if (position >= contents.length) return 0;\n      var size = Math.min(contents.length - position, length);\n      if (contents.slice) {\n        for (var i = 0; i < size; i++) {\n          buffer[offset + i] = contents[position + i];\n        }\n      } else {\n        for (var i = 0; i < size; i++) {\n          buffer[offset + i] = contents.get(position + i);\n        }\n      }\n      return size;\n    }\n    stream_ops.read = (stream, buffer, offset, length, position) => {\n      FS.forceLoadFile(node);\n      return writeChunks(stream, buffer, offset, length, position);\n    };\n    stream_ops.mmap = (stream, length, position, prot, flags) => {\n      FS.forceLoadFile(node);\n      var ptr = mmapAlloc(length);\n      if (!ptr) {\n        throw new FS.ErrnoError(48);\n      }\n      writeChunks(stream, HEAP8, ptr, length, position);\n      return { ptr, allocated: true };\n    };\n    node.stream_ops = stream_ops;\n    return node;\n  },\n};\nvar UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {\n  ptr >>>= 0;\n  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : '';\n};\nvar SYSCALLS = {\n  DEFAULT_POLLMASK: 5,\n  calculateAt(dirfd, path, allowEmpty) {\n    if (PATH.isAbs(path)) {\n      return path;\n    }\n    var dir;\n    if (dirfd === -100) {\n      dir = FS.cwd();\n    } else {\n      var dirstream = SYSCALLS.getStreamFromFD(dirfd);\n      dir = dirstream.path;\n    }\n    if (path.length == 0) {\n      if (!allowEmpty) {\n        throw new FS.ErrnoError(44);\n      }\n      return dir;\n    }\n    return dir + '/' + path;\n  },\n  writeStat(buf, stat) {\n    HEAPU32[(buf >>> 2) >>> 0] = stat.dev;\n    HEAPU32[((buf + 4) >>> 2) >>> 0] = stat.mode;\n    HEAPU32[((buf + 8) >>> 2) >>> 0] = stat.nlink;\n    HEAPU32[((buf + 12) >>> 2) >>> 0] = stat.uid;\n    HEAPU32[((buf + 16) >>> 2) >>> 0] = stat.gid;\n    HEAPU32[((buf + 20) >>> 2) >>> 0] = stat.rdev;\n    HEAP64[((buf + 24) >>> 3) >>> 0] = BigInt(stat.size);\n    HEAP32[((buf + 32) >>> 2) >>> 0] = 4096;\n    HEAP32[((buf + 36) >>> 2) >>> 0] = stat.blocks;\n    var atime = stat.atime.getTime();\n    var mtime = stat.mtime.getTime();\n    var ctime = stat.ctime.getTime();\n    HEAP64[((buf + 40) >>> 3) >>> 0] = BigInt(Math.floor(atime / 1e3));\n    HEAPU32[((buf + 48) >>> 2) >>> 0] = (atime % 1e3) * 1e3 * 1e3;\n    HEAP64[((buf + 56) >>> 3) >>> 0] = BigInt(Math.floor(mtime / 1e3));\n    HEAPU32[((buf + 64) >>> 2) >>> 0] = (mtime % 1e3) * 1e3 * 1e3;\n    HEAP64[((buf + 72) >>> 3) >>> 0] = BigInt(Math.floor(ctime / 1e3));\n    HEAPU32[((buf + 80) >>> 2) >>> 0] = (ctime % 1e3) * 1e3 * 1e3;\n    HEAP64[((buf + 88) >>> 3) >>> 0] = BigInt(stat.ino);\n    return 0;\n  },\n  writeStatFs(buf, stats) {\n    HEAPU32[((buf + 4) >>> 2) >>> 0] = stats.bsize;\n    HEAPU32[((buf + 60) >>> 2) >>> 0] = stats.bsize;\n    HEAP64[((buf + 8) >>> 3) >>> 0] = BigInt(stats.blocks);\n    HEAP64[((buf + 16) >>> 3) >>> 0] = BigInt(stats.bfree);\n    HEAP64[((buf + 24) >>> 3) >>> 0] = BigInt(stats.bavail);\n    HEAP64[((buf + 32) >>> 3) >>> 0] = BigInt(stats.files);\n    HEAP64[((buf + 40) >>> 3) >>> 0] = BigInt(stats.ffree);\n    HEAPU32[((buf + 48) >>> 2) >>> 0] = stats.fsid;\n    HEAPU32[((buf + 64) >>> 2) >>> 0] = stats.flags;\n    HEAPU32[((buf + 56) >>> 2) >>> 0] = stats.namelen;\n  },\n  doMsync(addr, stream, len, flags, offset) {\n    if (!FS.isFile(stream.node.mode)) {\n      throw new FS.ErrnoError(43);\n    }\n    if (flags & 2) {\n      return 0;\n    }\n    var buffer = HEAPU8.slice(addr, addr + len);\n    FS.msync(stream, buffer, offset, len, flags);\n  },\n  getStreamFromFD(fd) {\n    var stream = FS.getStreamChecked(fd);\n    return stream;\n  },\n  varargs: undefined,\n  getStr(ptr) {\n    var ret = UTF8ToString(ptr);\n    return ret;\n  },\n};\nfunction ___syscall_fcntl64(fd, cmd, varargs) {\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    switch (cmd) {\n      case 0: {\n        var arg = syscallGetVarargI();\n        if (arg < 0) {\n          return -28;\n        }\n        while (FS.streams[arg]) {\n          arg++;\n        }\n        var newStream;\n        newStream = FS.dupStream(stream, arg);\n        return newStream.fd;\n      }\n      case 1:\n      case 2:\n        return 0;\n      case 3:\n        return stream.flags;\n      case 4: {\n        var arg = syscallGetVarargI();\n        stream.flags |= arg;\n        return 0;\n      }\n      case 12: {\n        var arg = syscallGetVarargP();\n        var offset = 0;\n        HEAP16[((arg + offset) >>> 1) >>> 0] = 2;\n        return 0;\n      }\n      case 13:\n      case 14:\n        return 0;\n    }\n    return -28;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar stringToUTF8 = (str, outPtr, maxBytesToWrite) =>\n  stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);\nfunction ___syscall_getcwd(buf, size) {\n  buf >>>= 0;\n  size >>>= 0;\n  try {\n    if (size === 0) return -28;\n    var cwd = FS.cwd();\n    var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;\n    if (size < cwdLengthInBytes) return -68;\n    stringToUTF8(cwd, buf, size);\n    return cwdLengthInBytes;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_getdents64(fd, dirp, count) {\n  dirp >>>= 0;\n  count >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    stream.getdents ||= FS.readdir(stream.path);\n    var struct_size = 280;\n    var pos = 0;\n    var off = FS.llseek(stream, 0, 1);\n    var startIdx = Math.floor(off / struct_size);\n    var endIdx = Math.min(\n      stream.getdents.length,\n      startIdx + Math.floor(count / struct_size)\n    );\n    for (var idx = startIdx; idx < endIdx; idx++) {\n      var id;\n      var type;\n      var name = stream.getdents[idx];\n      if (name === '.') {\n        id = stream.node.id;\n        type = 4;\n      } else if (name === '..') {\n        var lookup = FS.lookupPath(stream.path, { parent: true });\n        id = lookup.node.id;\n        type = 4;\n      } else {\n        var child;\n        try {\n          child = FS.lookupNode(stream.node, name);\n        } catch (e) {\n          if (e?.errno === 28) {\n            continue;\n          }\n          throw e;\n        }\n        id = child.id;\n        type = FS.isChrdev(child.mode)\n          ? 2\n          : FS.isDir(child.mode)\n            ? 4\n            : FS.isLink(child.mode)\n              ? 10\n              : 8;\n      }\n      HEAP64[((dirp + pos) >>> 3) >>> 0] = BigInt(id);\n      HEAP64[((dirp + pos + 8) >>> 3) >>> 0] = BigInt((idx + 1) * struct_size);\n      HEAP16[((dirp + pos + 16) >>> 1) >>> 0] = 280;\n      HEAP8[(dirp + pos + 18) >>> 0] = type;\n      stringToUTF8(name, dirp + pos + 19, 256);\n      pos += struct_size;\n    }\n    FS.llseek(stream, idx * struct_size, 0);\n    return pos;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_ioctl(fd, op, varargs) {\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    switch (op) {\n      case 21509: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21505: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tcgets) {\n          var termios = stream.tty.ops.ioctl_tcgets(stream);\n          var argp = syscallGetVarargP();\n          HEAP32[(argp >>> 2) >>> 0] = termios.c_iflag || 0;\n          HEAP32[((argp + 4) >>> 2) >>> 0] = termios.c_oflag || 0;\n          HEAP32[((argp + 8) >>> 2) >>> 0] = termios.c_cflag || 0;\n          HEAP32[((argp + 12) >>> 2) >>> 0] = termios.c_lflag || 0;\n          for (var i = 0; i < 32; i++) {\n            HEAP8[(argp + i + 17) >>> 0] = termios.c_cc[i] || 0;\n          }\n          return 0;\n        }\n        return 0;\n      }\n      case 21510:\n      case 21511:\n      case 21512: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21506:\n      case 21507:\n      case 21508: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tcsets) {\n          var argp = syscallGetVarargP();\n          var c_iflag = HEAP32[(argp >>> 2) >>> 0];\n          var c_oflag = HEAP32[((argp + 4) >>> 2) >>> 0];\n          var c_cflag = HEAP32[((argp + 8) >>> 2) >>> 0];\n          var c_lflag = HEAP32[((argp + 12) >>> 2) >>> 0];\n          var c_cc = [];\n          for (var i = 0; i < 32; i++) {\n            c_cc.push(HEAP8[(argp + i + 17) >>> 0]);\n          }\n          return stream.tty.ops.ioctl_tcsets(stream.tty, op, {\n            c_iflag,\n            c_oflag,\n            c_cflag,\n            c_lflag,\n            c_cc,\n          });\n        }\n        return 0;\n      }\n      case 21519: {\n        if (!stream.tty) return -59;\n        var argp = syscallGetVarargP();\n        HEAP32[(argp >>> 2) >>> 0] = 0;\n        return 0;\n      }\n      case 21520: {\n        if (!stream.tty) return -59;\n        return -28;\n      }\n      case 21537:\n      case 21531: {\n        var argp = syscallGetVarargP();\n        return FS.ioctl(stream, op, argp);\n      }\n      case 21523: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tiocgwinsz) {\n          var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);\n          var argp = syscallGetVarargP();\n          HEAP16[(argp >>> 1) >>> 0] = winsize[0];\n          HEAP16[((argp + 2) >>> 1) >>> 0] = winsize[1];\n        }\n        return 0;\n      }\n      case 21524: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21515: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      default:\n        return -28;\n    }\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_openat(dirfd, path, flags, varargs) {\n  path >>>= 0;\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    path = SYSCALLS.getStr(path);\n    path = SYSCALLS.calculateAt(dirfd, path);\n    var mode = varargs ? syscallGetVarargI() : 0;\n    return FS.open(path, flags, mode).fd;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_stat64(path, buf) {\n  path >>>= 0;\n  buf >>>= 0;\n  try {\n    path = SYSCALLS.getStr(path);\n    return SYSCALLS.writeStat(buf, FS.stat(path));\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar __abort_js = () => abort('');\nvar runtimeKeepaliveCounter = 0;\nvar __emscripten_runtime_keepalive_clear = () => {\n  noExitRuntime = false;\n  runtimeKeepaliveCounter = 0;\n};\nfunction __mmap_js(len, prot, flags, fd, offset, allocated, addr) {\n  len >>>= 0;\n  offset = bigintToI53Checked(offset);\n  allocated >>>= 0;\n  addr >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var res = FS.mmap(stream, len, offset, prot, flags);\n    var ptr = res.ptr;\n    HEAP32[(allocated >>> 2) >>> 0] = res.allocated;\n    HEAPU32[(addr >>> 2) >>> 0] = ptr;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction __munmap_js(addr, len, prot, flags, fd, offset) {\n  addr >>>= 0;\n  len >>>= 0;\n  offset = bigintToI53Checked(offset);\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    if (prot & 2) {\n      SYSCALLS.doMsync(addr, stream, len, flags, offset);\n    }\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar timers = {};\nvar handleException = (e) => {\n  if (e instanceof ExitStatus || e == 'unwind') {\n    return EXITSTATUS;\n  }\n  quit_(1, e);\n};\nvar keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;\nvar _proc_exit = (code) => {\n  EXITSTATUS = code;\n  if (!keepRuntimeAlive()) {\n    Module['onExit']?.(code);\n    ABORT = true;\n  }\n  quit_(code, new ExitStatus(code));\n};\nvar exitJS = (status, implicit) => {\n  EXITSTATUS = status;\n  _proc_exit(status);\n};\nvar _exit = exitJS;\nvar maybeExit = () => {\n  if (!keepRuntimeAlive()) {\n    try {\n      _exit(EXITSTATUS);\n    } catch (e) {\n      handleException(e);\n    }\n  }\n};\nvar callUserCallback = (func) => {\n  if (ABORT) {\n    return;\n  }\n  try {\n    func();\n    maybeExit();\n  } catch (e) {\n    handleException(e);\n  }\n};\nvar _emscripten_get_now = () => performance.now();\nvar __setitimer_js = (which, timeout_ms) => {\n  if (timers[which]) {\n    clearTimeout(timers[which].id);\n    delete timers[which];\n  }\n  if (!timeout_ms) return 0;\n  var id = setTimeout(() => {\n    delete timers[which];\n    callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));\n  }, timeout_ms);\n  timers[which] = { id, timeout_ms };\n  return 0;\n};\nvar __tzset_js = function (timezone, daylight, std_name, dst_name) {\n  timezone >>>= 0;\n  daylight >>>= 0;\n  std_name >>>= 0;\n  dst_name >>>= 0;\n  var currentYear = new Date().getFullYear();\n  var winter = new Date(currentYear, 0, 1);\n  var summer = new Date(currentYear, 6, 1);\n  var winterOffset = winter.getTimezoneOffset();\n  var summerOffset = summer.getTimezoneOffset();\n  var stdTimezoneOffset = Math.max(winterOffset, summerOffset);\n  HEAPU32[(timezone >>> 2) >>> 0] = stdTimezoneOffset * 60;\n  HEAP32[(daylight >>> 2) >>> 0] = Number(winterOffset != summerOffset);\n  var extractZone = (timezoneOffset) => {\n    var sign = timezoneOffset >= 0 ? '-' : '+';\n    var absOffset = Math.abs(timezoneOffset);\n    var hours = String(Math.floor(absOffset / 60)).padStart(2, '0');\n    var minutes = String(absOffset % 60).padStart(2, '0');\n    return `UTC${sign}${hours}${minutes}`;\n  };\n  var winterName = extractZone(winterOffset);\n  var summerName = extractZone(summerOffset);\n  if (summerOffset < winterOffset) {\n    stringToUTF8(winterName, std_name, 17);\n    stringToUTF8(summerName, dst_name, 17);\n  } else {\n    stringToUTF8(winterName, dst_name, 17);\n    stringToUTF8(summerName, std_name, 17);\n  }\n};\nvar _emscripten_date_now = () => Date.now();\nvar nowIsMonotonic = 1;\nvar checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;\nfunction _clock_time_get(clk_id, ignored_precision, ptime) {\n  ignored_precision = bigintToI53Checked(ignored_precision);\n  ptime >>>= 0;\n  if (!checkWasiClock(clk_id)) {\n    return 28;\n  }\n  var now;\n  if (clk_id === 0) {\n    now = _emscripten_date_now();\n  } else if (nowIsMonotonic) {\n    now = _emscripten_get_now();\n  } else {\n    return 52;\n  }\n  var nsec = Math.round(now * 1e3 * 1e3);\n  HEAP64[(ptime >>> 3) >>> 0] = BigInt(nsec);\n  return 0;\n}\nvar getHeapMax = () => 4294901760;\nfunction _emscripten_get_heap_max() {\n  return getHeapMax();\n}\nvar _emscripten_has_asyncify = () => 1;\nvar growMemory = (size) => {\n  var oldHeapSize = wasmMemory.buffer.byteLength;\n  var pages = ((size - oldHeapSize + 65535) / 65536) | 0;\n  try {\n    wasmMemory.grow(pages);\n    updateMemoryViews();\n    return 1;\n  } catch (e) {}\n};\nfunction _emscripten_resize_heap(requestedSize) {\n  requestedSize >>>= 0;\n  var oldSize = HEAPU8.length;\n  var maxHeapSize = getHeapMax();\n  if (requestedSize > maxHeapSize) {\n    return false;\n  }\n  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {\n    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);\n    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);\n    var newSize = Math.min(\n      maxHeapSize,\n      alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)\n    );\n    var replacement = growMemory(newSize);\n    if (replacement) {\n      return true;\n    }\n  }\n  return false;\n}\nvar stackAlloc = (sz) => __emscripten_stack_alloc(sz);\nvar stringToUTF8OnStack = (str) => {\n  var size = lengthBytesUTF8(str) + 1;\n  var ret = stackAlloc(size);\n  stringToUTF8(str, ret, size);\n  return ret;\n};\nvar writeI53ToI64 = (ptr, num) => {\n  HEAPU32[(ptr >>> 2) >>> 0] = num;\n  var lower = HEAPU32[(ptr >>> 2) >>> 0];\n  HEAPU32[((ptr + 4) >>> 2) >>> 0] = (num - lower) / 4294967296;\n};\nvar stringToNewUTF8 = (str) => {\n  var size = lengthBytesUTF8(str) + 1;\n  var ret = _malloc(size);\n  if (ret) stringToUTF8(str, ret, size);\n  return ret;\n};\nvar readI53FromI64 = (ptr) =>\n  HEAPU32[(ptr >>> 2) >>> 0] + HEAP32[((ptr + 4) >>> 2) >>> 0] * 4294967296;\nvar WebGPU = {\n  Internals: {\n    jsObjects: [],\n    jsObjectInsert: (ptr, jsObject) => {\n      ptr >>>= 0;\n      WebGPU.Internals.jsObjects[ptr] = jsObject;\n    },\n    bufferOnUnmaps: [],\n    futures: [],\n    futureInsert: (futureId, promise) => {\n      WebGPU.Internals.futures[futureId] = new Promise((resolve) =>\n        promise.finally(() => resolve(futureId))\n      );\n    },\n  },\n  getJsObject: (ptr) => {\n    if (!ptr) return undefined;\n    ptr >>>= 0;\n    return WebGPU.Internals.jsObjects[ptr];\n  },\n  importJsAdapter: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateAdapter(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBindGroup: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateBindGroup(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBindGroupLayout: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateBindGroupLayout(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBuffer: (buffer, parentPtr = 0) => {\n    assert(buffer.mapState === 'unmapped');\n    var bufferPtr = _emwgpuCreateBuffer(parentPtr);\n    WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);\n    return bufferPtr;\n  },\n  importJsCommandBuffer: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateCommandBuffer(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsCommandEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateCommandEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsComputePassEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateComputePassEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsComputePipeline: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateComputePipeline(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsDevice: (device, parentPtr = 0) => {\n    var queuePtr = _emwgpuCreateQueue(parentPtr);\n    var devicePtr = _emwgpuCreateDevice(parentPtr, queuePtr);\n    WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);\n    WebGPU.Internals.jsObjectInsert(devicePtr, device);\n    return devicePtr;\n  },\n  importJsExternalTexture: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateExternalTexture(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsPipelineLayout: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreatePipelineLayout(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsQuerySet: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateQuerySet(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsQueue: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateQueue(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderBundle: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderBundle(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderBundleEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderBundleEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderPassEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderPassEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderPipeline: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderPipeline(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsSampler: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateSampler(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsShaderModule: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateShaderModule(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsSurface: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateSurface(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsTexture: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateTexture(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsTextureView: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateTextureView(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  errorCallback: (callback, type, message, userdata) => {\n    var sp = stackSave();\n    var messagePtr = stringToUTF8OnStack(message);\n    ((a1, a2, a3) => dynCall_viii(callback, a1, a2, a3))(\n      type,\n      messagePtr,\n      userdata\n    );\n    stackRestore(sp);\n  },\n  iterateExtensions: (root, handlers) => {\n    for (\n      var ptr = HEAPU32[(root >>> 2) >>> 0];\n      ptr;\n      ptr = HEAPU32[(ptr >>> 2) >>> 0]\n    ) {\n      var sType = HEAP32[((ptr + 4) >>> 2) >>> 0];\n      var handler = handlers[sType](ptr);\n    }\n  },\n  setStringView: (ptr, data, length) => {\n    HEAPU32[(ptr >>> 2) >>> 0] = data;\n    HEAPU32[((ptr + 4) >>> 2) >>> 0] = length;\n  },\n  makeStringFromStringView: (stringViewPtr) => {\n    var ptr = HEAPU32[(stringViewPtr >>> 2) >>> 0];\n    var length = HEAPU32[((stringViewPtr + 4) >>> 2) >>> 0];\n    return UTF8ToString(ptr, length);\n  },\n  makeStringFromOptionalStringView: (stringViewPtr) => {\n    var ptr = HEAPU32[(stringViewPtr >>> 2) >>> 0];\n    var length = HEAPU32[((stringViewPtr + 4) >>> 2) >>> 0];\n    if (!ptr) {\n      if (length === 0) {\n        return '';\n      }\n      return undefined;\n    }\n    return UTF8ToString(ptr, length);\n  },\n  makeColor: (ptr) => ({\n    r: HEAPF64[(ptr >>> 3) >>> 0],\n    g: HEAPF64[((ptr + 8) >>> 3) >>> 0],\n    b: HEAPF64[((ptr + 16) >>> 3) >>> 0],\n    a: HEAPF64[((ptr + 24) >>> 3) >>> 0],\n  }),\n  makeExtent3D: (ptr) => ({\n    width: HEAPU32[(ptr >>> 2) >>> 0],\n    height: HEAPU32[((ptr + 4) >>> 2) >>> 0],\n    depthOrArrayLayers: HEAPU32[((ptr + 8) >>> 2) >>> 0],\n  }),\n  makeOrigin3D: (ptr) => ({\n    x: HEAPU32[(ptr >>> 2) >>> 0],\n    y: HEAPU32[((ptr + 4) >>> 2) >>> 0],\n    z: HEAPU32[((ptr + 8) >>> 2) >>> 0],\n  }),\n  makeTexelCopyTextureInfo: (ptr) => ({\n    texture: WebGPU.getJsObject(HEAPU32[(ptr >>> 2) >>> 0]),\n    mipLevel: HEAPU32[((ptr + 4) >>> 2) >>> 0],\n    origin: WebGPU.makeOrigin3D(ptr + 8),\n    aspect: WebGPU.TextureAspect[HEAP32[((ptr + 20) >>> 2) >>> 0]],\n  }),\n  makeTexelCopyBufferLayout: (ptr) => {\n    var bytesPerRow = HEAPU32[((ptr + 8) >>> 2) >>> 0];\n    var rowsPerImage = HEAPU32[((ptr + 12) >>> 2) >>> 0];\n    return {\n      offset: readI53FromI64(ptr),\n      bytesPerRow: bytesPerRow === 4294967295 ? undefined : bytesPerRow,\n      rowsPerImage: rowsPerImage === 4294967295 ? undefined : rowsPerImage,\n    };\n  },\n  makeTexelCopyBufferInfo: (ptr) => {\n    var layoutPtr = ptr + 0;\n    var bufferCopyView = WebGPU.makeTexelCopyBufferLayout(layoutPtr);\n    bufferCopyView['buffer'] = WebGPU.getJsObject(\n      HEAPU32[((ptr + 16) >>> 2) >>> 0]\n    );\n    return bufferCopyView;\n  },\n  makePassTimestampWrites: (ptr) => {\n    if (ptr === 0) return undefined;\n    return {\n      querySet: WebGPU.getJsObject(HEAPU32[((ptr + 4) >>> 2) >>> 0]),\n      beginningOfPassWriteIndex: HEAPU32[((ptr + 8) >>> 2) >>> 0],\n      endOfPassWriteIndex: HEAPU32[((ptr + 12) >>> 2) >>> 0],\n    };\n  },\n  makePipelineConstants: (constantCount, constantsPtr) => {\n    if (!constantCount) return;\n    var constants = {};\n    for (var i = 0; i < constantCount; ++i) {\n      var entryPtr = constantsPtr + 24 * i;\n      var key = WebGPU.makeStringFromStringView(entryPtr + 4);\n      constants[key] = HEAPF64[((entryPtr + 16) >>> 3) >>> 0];\n    }\n    return constants;\n  },\n  makePipelineLayout: (layoutPtr) => {\n    if (!layoutPtr) return 'auto';\n    return WebGPU.getJsObject(layoutPtr);\n  },\n  makeComputeState: (ptr) => {\n    if (!ptr) return undefined;\n    var desc = {\n      module: WebGPU.getJsObject(HEAPU32[((ptr + 4) >>> 2) >>> 0]),\n      constants: WebGPU.makePipelineConstants(\n        HEAPU32[((ptr + 16) >>> 2) >>> 0],\n        HEAPU32[((ptr + 20) >>> 2) >>> 0]\n      ),\n      entryPoint: WebGPU.makeStringFromOptionalStringView(ptr + 8),\n    };\n    return desc;\n  },\n  makeComputePipelineDesc: (descriptor) => {\n    var desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      layout: WebGPU.makePipelineLayout(\n        HEAPU32[((descriptor + 12) >>> 2) >>> 0]\n      ),\n      compute: WebGPU.makeComputeState(descriptor + 16),\n    };\n    return desc;\n  },\n  makeRenderPipelineDesc: (descriptor) => {\n    function makePrimitiveState(psPtr) {\n      if (!psPtr) return undefined;\n      return {\n        topology: WebGPU.PrimitiveTopology[HEAP32[((psPtr + 4) >>> 2) >>> 0]],\n        stripIndexFormat: WebGPU.IndexFormat[HEAP32[((psPtr + 8) >>> 2) >>> 0]],\n        frontFace: WebGPU.FrontFace[HEAP32[((psPtr + 12) >>> 2) >>> 0]],\n        cullMode: WebGPU.CullMode[HEAP32[((psPtr + 16) >>> 2) >>> 0]],\n        unclippedDepth: !!HEAPU32[((psPtr + 20) >>> 2) >>> 0],\n      };\n    }\n    function makeBlendComponent(bdPtr) {\n      if (!bdPtr) return undefined;\n      return {\n        operation: WebGPU.BlendOperation[HEAP32[(bdPtr >>> 2) >>> 0]],\n        srcFactor: WebGPU.BlendFactor[HEAP32[((bdPtr + 4) >>> 2) >>> 0]],\n        dstFactor: WebGPU.BlendFactor[HEAP32[((bdPtr + 8) >>> 2) >>> 0]],\n      };\n    }\n    function makeBlendState(bsPtr) {\n      if (!bsPtr) return undefined;\n      return {\n        alpha: makeBlendComponent(bsPtr + 12),\n        color: makeBlendComponent(bsPtr + 0),\n      };\n    }\n    function makeColorState(csPtr) {\n      var format = WebGPU.TextureFormat[HEAP32[((csPtr + 4) >>> 2) >>> 0]];\n      return format\n        ? {\n            format,\n            blend: makeBlendState(HEAPU32[((csPtr + 8) >>> 2) >>> 0]),\n            writeMask: HEAPU32[((csPtr + 16) >>> 2) >>> 0],\n          }\n        : undefined;\n    }\n    function makeColorStates(count, csArrayPtr) {\n      var states = [];\n      for (var i = 0; i < count; ++i) {\n        states.push(makeColorState(csArrayPtr + 24 * i));\n      }\n      return states;\n    }\n    function makeStencilStateFace(ssfPtr) {\n      return {\n        compare: WebGPU.CompareFunction[HEAP32[(ssfPtr >>> 2) >>> 0]],\n        failOp: WebGPU.StencilOperation[HEAP32[((ssfPtr + 4) >>> 2) >>> 0]],\n        depthFailOp:\n          WebGPU.StencilOperation[HEAP32[((ssfPtr + 8) >>> 2) >>> 0]],\n        passOp: WebGPU.StencilOperation[HEAP32[((ssfPtr + 12) >>> 2) >>> 0]],\n      };\n    }\n    function makeDepthStencilState(dssPtr) {\n      if (!dssPtr) return undefined;\n      return {\n        format: WebGPU.TextureFormat[HEAP32[((dssPtr + 4) >>> 2) >>> 0]],\n        depthWriteEnabled: !!HEAPU32[((dssPtr + 8) >>> 2) >>> 0],\n        depthCompare:\n          WebGPU.CompareFunction[HEAP32[((dssPtr + 12) >>> 2) >>> 0]],\n        stencilFront: makeStencilStateFace(dssPtr + 16),\n        stencilBack: makeStencilStateFace(dssPtr + 32),\n        stencilReadMask: HEAPU32[((dssPtr + 48) >>> 2) >>> 0],\n        stencilWriteMask: HEAPU32[((dssPtr + 52) >>> 2) >>> 0],\n        depthBias: HEAP32[((dssPtr + 56) >>> 2) >>> 0],\n        depthBiasSlopeScale: HEAPF32[((dssPtr + 60) >>> 2) >>> 0],\n        depthBiasClamp: HEAPF32[((dssPtr + 64) >>> 2) >>> 0],\n      };\n    }\n    function makeVertexAttribute(vaPtr) {\n      return {\n        format: WebGPU.VertexFormat[HEAP32[((vaPtr + 4) >>> 2) >>> 0]],\n        offset: readI53FromI64(vaPtr + 8),\n        shaderLocation: HEAPU32[((vaPtr + 16) >>> 2) >>> 0],\n      };\n    }\n    function makeVertexAttributes(count, vaArrayPtr) {\n      var vas = [];\n      for (var i = 0; i < count; ++i) {\n        vas.push(makeVertexAttribute(vaArrayPtr + i * 24));\n      }\n      return vas;\n    }\n    function makeVertexBuffer(vbPtr) {\n      if (!vbPtr) return undefined;\n      var stepMode = WebGPU.VertexStepMode[HEAP32[((vbPtr + 4) >>> 2) >>> 0]];\n      var attributeCount = HEAPU32[((vbPtr + 16) >>> 2) >>> 0];\n      if (!stepMode && !attributeCount) {\n        return null;\n      }\n      return {\n        arrayStride: readI53FromI64(vbPtr + 8),\n        stepMode,\n        attributes: makeVertexAttributes(\n          attributeCount,\n          HEAPU32[((vbPtr + 20) >>> 2) >>> 0]\n        ),\n      };\n    }\n    function makeVertexBuffers(count, vbArrayPtr) {\n      if (!count) return undefined;\n      var vbs = [];\n      for (var i = 0; i < count; ++i) {\n        vbs.push(makeVertexBuffer(vbArrayPtr + i * 24));\n      }\n      return vbs;\n    }\n    function makeVertexState(viPtr) {\n      if (!viPtr) return undefined;\n      var desc = {\n        module: WebGPU.getJsObject(HEAPU32[((viPtr + 4) >>> 2) >>> 0]),\n        constants: WebGPU.makePipelineConstants(\n          HEAPU32[((viPtr + 16) >>> 2) >>> 0],\n          HEAPU32[((viPtr + 20) >>> 2) >>> 0]\n        ),\n        buffers: makeVertexBuffers(\n          HEAPU32[((viPtr + 24) >>> 2) >>> 0],\n          HEAPU32[((viPtr + 28) >>> 2) >>> 0]\n        ),\n        entryPoint: WebGPU.makeStringFromOptionalStringView(viPtr + 8),\n      };\n      return desc;\n    }\n    function makeMultisampleState(msPtr) {\n      if (!msPtr) return undefined;\n      return {\n        count: HEAPU32[((msPtr + 4) >>> 2) >>> 0],\n        mask: HEAPU32[((msPtr + 8) >>> 2) >>> 0],\n        alphaToCoverageEnabled: !!HEAPU32[((msPtr + 12) >>> 2) >>> 0],\n      };\n    }\n    function makeFragmentState(fsPtr) {\n      if (!fsPtr) return undefined;\n      var desc = {\n        module: WebGPU.getJsObject(HEAPU32[((fsPtr + 4) >>> 2) >>> 0]),\n        constants: WebGPU.makePipelineConstants(\n          HEAPU32[((fsPtr + 16) >>> 2) >>> 0],\n          HEAPU32[((fsPtr + 20) >>> 2) >>> 0]\n        ),\n        targets: makeColorStates(\n          HEAPU32[((fsPtr + 24) >>> 2) >>> 0],\n          HEAPU32[((fsPtr + 28) >>> 2) >>> 0]\n        ),\n        entryPoint: WebGPU.makeStringFromOptionalStringView(fsPtr + 8),\n      };\n      return desc;\n    }\n    var desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      layout: WebGPU.makePipelineLayout(\n        HEAPU32[((descriptor + 12) >>> 2) >>> 0]\n      ),\n      vertex: makeVertexState(descriptor + 16),\n      primitive: makePrimitiveState(descriptor + 48),\n      depthStencil: makeDepthStencilState(\n        HEAPU32[((descriptor + 72) >>> 2) >>> 0]\n      ),\n      multisample: makeMultisampleState(descriptor + 76),\n      fragment: makeFragmentState(HEAPU32[((descriptor + 92) >>> 2) >>> 0]),\n    };\n    return desc;\n  },\n  fillLimitStruct: (limits, limitsOutPtr) => {\n    var nextInChainPtr = HEAPU32[(limitsOutPtr >>> 2) >>> 0];\n    function setLimitValueU32(name, basePtr, limitOffset, fallbackValue = 0) {\n      var limitValue = limits[name] ?? fallbackValue;\n      HEAPU32[((basePtr + limitOffset) >>> 2) >>> 0] = limitValue;\n    }\n    function setLimitValueU64(name, basePtr, limitOffset, fallbackValue = 0) {\n      var limitValue = limits[name] ?? fallbackValue;\n      writeI53ToI64(basePtr + limitOffset, limitValue);\n    }\n    setLimitValueU32('maxTextureDimension1D', limitsOutPtr, 4);\n    setLimitValueU32('maxTextureDimension2D', limitsOutPtr, 8);\n    setLimitValueU32('maxTextureDimension3D', limitsOutPtr, 12);\n    setLimitValueU32('maxTextureArrayLayers', limitsOutPtr, 16);\n    setLimitValueU32('maxBindGroups', limitsOutPtr, 20);\n    setLimitValueU32('maxBindGroupsPlusVertexBuffers', limitsOutPtr, 24);\n    setLimitValueU32('maxBindingsPerBindGroup', limitsOutPtr, 28);\n    setLimitValueU32(\n      'maxDynamicUniformBuffersPerPipelineLayout',\n      limitsOutPtr,\n      32\n    );\n    setLimitValueU32(\n      'maxDynamicStorageBuffersPerPipelineLayout',\n      limitsOutPtr,\n      36\n    );\n    setLimitValueU32('maxSampledTexturesPerShaderStage', limitsOutPtr, 40);\n    setLimitValueU32('maxSamplersPerShaderStage', limitsOutPtr, 44);\n    setLimitValueU32('maxStorageBuffersPerShaderStage', limitsOutPtr, 48);\n    setLimitValueU32('maxStorageTexturesPerShaderStage', limitsOutPtr, 52);\n    setLimitValueU32('maxUniformBuffersPerShaderStage', limitsOutPtr, 56);\n    setLimitValueU32('minUniformBufferOffsetAlignment', limitsOutPtr, 80);\n    setLimitValueU32('minStorageBufferOffsetAlignment', limitsOutPtr, 84);\n    setLimitValueU64('maxUniformBufferBindingSize', limitsOutPtr, 64);\n    setLimitValueU64('maxStorageBufferBindingSize', limitsOutPtr, 72);\n    setLimitValueU32('maxVertexBuffers', limitsOutPtr, 88);\n    setLimitValueU64('maxBufferSize', limitsOutPtr, 96);\n    setLimitValueU32('maxVertexAttributes', limitsOutPtr, 104);\n    setLimitValueU32('maxVertexBufferArrayStride', limitsOutPtr, 108);\n    setLimitValueU32('maxInterStageShaderVariables', limitsOutPtr, 112);\n    setLimitValueU32('maxColorAttachments', limitsOutPtr, 116);\n    setLimitValueU32('maxColorAttachmentBytesPerSample', limitsOutPtr, 120);\n    setLimitValueU32('maxComputeWorkgroupStorageSize', limitsOutPtr, 124);\n    setLimitValueU32('maxComputeInvocationsPerWorkgroup', limitsOutPtr, 128);\n    setLimitValueU32('maxComputeWorkgroupSizeX', limitsOutPtr, 132);\n    setLimitValueU32('maxComputeWorkgroupSizeY', limitsOutPtr, 136);\n    setLimitValueU32('maxComputeWorkgroupSizeZ', limitsOutPtr, 140);\n    setLimitValueU32('maxComputeWorkgroupsPerDimension', limitsOutPtr, 144);\n    setLimitValueU32('maxImmediateSize', limitsOutPtr, 148);\n    if (nextInChainPtr !== 0) {\n      var sType = HEAP32[((nextInChainPtr + 4) >>> 2) >>> 0];\n      var compatibilityModeLimitsPtr = nextInChainPtr;\n      setLimitValueU32(\n        'maxStorageBuffersInVertexStage',\n        compatibilityModeLimitsPtr,\n        8,\n        limits.maxStorageBuffersPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageBuffersInFragmentStage',\n        compatibilityModeLimitsPtr,\n        16,\n        limits.maxStorageBuffersPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageTexturesInVertexStage',\n        compatibilityModeLimitsPtr,\n        12,\n        limits.maxStorageTexturesPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageTexturesInFragmentStage',\n        compatibilityModeLimitsPtr,\n        20,\n        limits.maxStorageTexturesPerShaderStage\n      );\n    }\n  },\n  fillAdapterInfoStruct: (info, infoStruct) => {\n    HEAPU32[((infoStruct + 52) >>> 2) >>> 0] = info.subgroupMinSize;\n    HEAPU32[((infoStruct + 56) >>> 2) >>> 0] = info.subgroupMaxSize;\n    var strs = info.vendor + info.architecture + info.device + info.description;\n    var strPtr = stringToNewUTF8(strs);\n    var vendorLen = lengthBytesUTF8(info.vendor);\n    WebGPU.setStringView(infoStruct + 4, strPtr, vendorLen);\n    strPtr += vendorLen;\n    var architectureLen = lengthBytesUTF8(info.architecture);\n    WebGPU.setStringView(infoStruct + 12, strPtr, architectureLen);\n    strPtr += architectureLen;\n    var deviceLen = lengthBytesUTF8(info.device);\n    WebGPU.setStringView(infoStruct + 20, strPtr, deviceLen);\n    strPtr += deviceLen;\n    var descriptionLen = lengthBytesUTF8(info.description);\n    WebGPU.setStringView(infoStruct + 28, strPtr, descriptionLen);\n    strPtr += descriptionLen;\n    HEAP32[((infoStruct + 36) >>> 2) >>> 0] = 2;\n    var adapterType = info.isFallbackAdapter ? 3 : 4;\n    HEAP32[((infoStruct + 40) >>> 2) >>> 0] = adapterType;\n    HEAPU32[((infoStruct + 44) >>> 2) >>> 0] = 0;\n    HEAPU32[((infoStruct + 48) >>> 2) >>> 0] = 0;\n  },\n  AddressMode: [, 'clamp-to-edge', 'repeat', 'mirror-repeat'],\n  BlendFactor: [\n    ,\n    'zero',\n    'one',\n    'src',\n    'one-minus-src',\n    'src-alpha',\n    'one-minus-src-alpha',\n    'dst',\n    'one-minus-dst',\n    'dst-alpha',\n    'one-minus-dst-alpha',\n    'src-alpha-saturated',\n    'constant',\n    'one-minus-constant',\n    'src1',\n    'one-minus-src1',\n    'src1-alpha',\n    'one-minus-src1-alpha',\n  ],\n  BlendOperation: [, 'add', 'subtract', 'reverse-subtract', 'min', 'max'],\n  BufferBindingType: [, , 'uniform', 'storage', 'read-only-storage'],\n  BufferMapState: [, 'unmapped', 'pending', 'mapped'],\n  CompareFunction: [\n    ,\n    'never',\n    'less',\n    'equal',\n    'less-equal',\n    'greater',\n    'not-equal',\n    'greater-equal',\n    'always',\n  ],\n  CompilationInfoRequestStatus: [, 'success', 'callback-cancelled'],\n  ComponentSwizzle: [, '0', '1', 'r', 'g', 'b', 'a'],\n  CompositeAlphaMode: [\n    ,\n    'opaque',\n    'premultiplied',\n    'unpremultiplied',\n    'inherit',\n  ],\n  CullMode: [, 'none', 'front', 'back'],\n  ErrorFilter: [, 'validation', 'out-of-memory', 'internal'],\n  FeatureLevel: [, 'compatibility', 'core'],\n  FeatureName: {\n    1: 'core-features-and-limits',\n    2: 'depth-clip-control',\n    3: 'depth32float-stencil8',\n    4: 'texture-compression-bc',\n    5: 'texture-compression-bc-sliced-3d',\n    6: 'texture-compression-etc2',\n    7: 'texture-compression-astc',\n    8: 'texture-compression-astc-sliced-3d',\n    9: 'timestamp-query',\n    10: 'indirect-first-instance',\n    11: 'shader-f16',\n    12: 'rg11b10ufloat-renderable',\n    13: 'bgra8unorm-storage',\n    14: 'float32-filterable',\n    15: 'float32-blendable',\n    16: 'clip-distances',\n    17: 'dual-source-blending',\n    18: 'subgroups',\n    19: 'texture-formats-tier1',\n    20: 'texture-formats-tier2',\n    21: 'primitive-index',\n    22: 'texture-component-swizzle',\n    327692: 'chromium-experimental-unorm16-texture-formats',\n    327729: 'chromium-experimental-multi-draw-indirect',\n  },\n  FilterMode: [, 'nearest', 'linear'],\n  FrontFace: [, 'ccw', 'cw'],\n  IndexFormat: [, 'uint16', 'uint32'],\n  InstanceFeatureName: [\n    ,\n    'timed-wait-any',\n    'shader-source-spirv',\n    'multiple-devices-per-adapter',\n  ],\n  LoadOp: [, 'load', 'clear'],\n  MipmapFilterMode: [, 'nearest', 'linear'],\n  OptionalBool: ['false', 'true'],\n  PowerPreference: [, 'low-power', 'high-performance'],\n  PredefinedColorSpace: [, 'srgb', 'display-p3'],\n  PrimitiveTopology: [\n    ,\n    'point-list',\n    'line-list',\n    'line-strip',\n    'triangle-list',\n    'triangle-strip',\n  ],\n  QueryType: [, 'occlusion', 'timestamp'],\n  SamplerBindingType: [, , 'filtering', 'non-filtering', 'comparison'],\n  Status: [, 'success', 'error'],\n  StencilOperation: [\n    ,\n    'keep',\n    'zero',\n    'replace',\n    'invert',\n    'increment-clamp',\n    'decrement-clamp',\n    'increment-wrap',\n    'decrement-wrap',\n  ],\n  StorageTextureAccess: [, , 'write-only', 'read-only', 'read-write'],\n  StoreOp: [, 'store', 'discard'],\n  SurfaceGetCurrentTextureStatus: [\n    ,\n    'success-optimal',\n    'success-suboptimal',\n    'timeout',\n    'outdated',\n    'lost',\n    'error',\n  ],\n  TextureAspect: [, 'all', 'stencil-only', 'depth-only'],\n  TextureDimension: [, '1d', '2d', '3d'],\n  TextureFormat: [\n    ,\n    'r8unorm',\n    'r8snorm',\n    'r8uint',\n    'r8sint',\n    'r16unorm',\n    'r16snorm',\n    'r16uint',\n    'r16sint',\n    'r16float',\n    'rg8unorm',\n    'rg8snorm',\n    'rg8uint',\n    'rg8sint',\n    'r32float',\n    'r32uint',\n    'r32sint',\n    'rg16unorm',\n    'rg16snorm',\n    'rg16uint',\n    'rg16sint',\n    'rg16float',\n    'rgba8unorm',\n    'rgba8unorm-srgb',\n    'rgba8snorm',\n    'rgba8uint',\n    'rgba8sint',\n    'bgra8unorm',\n    'bgra8unorm-srgb',\n    'rgb10a2uint',\n    'rgb10a2unorm',\n    'rg11b10ufloat',\n    'rgb9e5ufloat',\n    'rg32float',\n    'rg32uint',\n    'rg32sint',\n    'rgba16unorm',\n    'rgba16snorm',\n    'rgba16uint',\n    'rgba16sint',\n    'rgba16float',\n    'rgba32float',\n    'rgba32uint',\n    'rgba32sint',\n    'stencil8',\n    'depth16unorm',\n    'depth24plus',\n    'depth24plus-stencil8',\n    'depth32float',\n    'depth32float-stencil8',\n    'bc1-rgba-unorm',\n    'bc1-rgba-unorm-srgb',\n    'bc2-rgba-unorm',\n    'bc2-rgba-unorm-srgb',\n    'bc3-rgba-unorm',\n    'bc3-rgba-unorm-srgb',\n    'bc4-r-unorm',\n    'bc4-r-snorm',\n    'bc5-rg-unorm',\n    'bc5-rg-snorm',\n    'bc6h-rgb-ufloat',\n    'bc6h-rgb-float',\n    'bc7-rgba-unorm',\n    'bc7-rgba-unorm-srgb',\n    'etc2-rgb8unorm',\n    'etc2-rgb8unorm-srgb',\n    'etc2-rgb8a1unorm',\n    'etc2-rgb8a1unorm-srgb',\n    'etc2-rgba8unorm',\n    'etc2-rgba8unorm-srgb',\n    'eac-r11unorm',\n    'eac-r11snorm',\n    'eac-rg11unorm',\n    'eac-rg11snorm',\n    'astc-4x4-unorm',\n    'astc-4x4-unorm-srgb',\n    'astc-5x4-unorm',\n    'astc-5x4-unorm-srgb',\n    'astc-5x5-unorm',\n    'astc-5x5-unorm-srgb',\n    'astc-6x5-unorm',\n    'astc-6x5-unorm-srgb',\n    'astc-6x6-unorm',\n    'astc-6x6-unorm-srgb',\n    'astc-8x5-unorm',\n    'astc-8x5-unorm-srgb',\n    'astc-8x6-unorm',\n    'astc-8x6-unorm-srgb',\n    'astc-8x8-unorm',\n    'astc-8x8-unorm-srgb',\n    'astc-10x5-unorm',\n    'astc-10x5-unorm-srgb',\n    'astc-10x6-unorm',\n    'astc-10x6-unorm-srgb',\n    'astc-10x8-unorm',\n    'astc-10x8-unorm-srgb',\n    'astc-10x10-unorm',\n    'astc-10x10-unorm-srgb',\n    'astc-12x10-unorm',\n    'astc-12x10-unorm-srgb',\n    'astc-12x12-unorm',\n    'astc-12x12-unorm-srgb',\n  ],\n  TextureSampleType: [\n    ,\n    ,\n    'float',\n    'unfilterable-float',\n    'depth',\n    'sint',\n    'uint',\n  ],\n  TextureViewDimension: [, '1d', '2d', '2d-array', 'cube', 'cube-array', '3d'],\n  ToneMappingMode: [, 'standard', 'extended'],\n  VertexFormat: [\n    ,\n    'uint8',\n    'uint8x2',\n    'uint8x4',\n    'sint8',\n    'sint8x2',\n    'sint8x4',\n    'unorm8',\n    'unorm8x2',\n    'unorm8x4',\n    'snorm8',\n    'snorm8x2',\n    'snorm8x4',\n    'uint16',\n    'uint16x2',\n    'uint16x4',\n    'sint16',\n    'sint16x2',\n    'sint16x4',\n    'unorm16',\n    'unorm16x2',\n    'unorm16x4',\n    'snorm16',\n    'snorm16x2',\n    'snorm16x4',\n    'float16',\n    'float16x2',\n    'float16x4',\n    'float32',\n    'float32x2',\n    'float32x3',\n    'float32x4',\n    'uint32',\n    'uint32x2',\n    'uint32x3',\n    'uint32x4',\n    'sint32',\n    'sint32x2',\n    'sint32x3',\n    'sint32x4',\n    'unorm10-10-10-2',\n    'unorm8x4-bgra',\n  ],\n  VertexStepMode: [, 'vertex', 'instance'],\n  WGSLLanguageFeatureName: [\n    ,\n    'readonly_and_readwrite_storage_textures',\n    'packed_4x8_integer_dot_product',\n    'unrestricted_pointer_parameters',\n    'pointer_composite_access',\n    'uniform_buffer_standard_layout',\n    'subgroup_id',\n    'texture_and_sampler_let',\n    'subgroup_uniformity',\n    'texture_formats_tier1',\n  ],\n};\nvar emwgpuStringToInt_DeviceLostReason = {\n  undefined: 1,\n  unknown: 1,\n  destroyed: 2,\n};\nfunction _emwgpuAdapterRequestDevice(\n  adapterPtr,\n  futureId,\n  deviceLostFutureId,\n  devicePtr,\n  queuePtr,\n  descriptor\n) {\n  adapterPtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  deviceLostFutureId = bigintToI53Checked(deviceLostFutureId);\n  devicePtr >>>= 0;\n  queuePtr >>>= 0;\n  descriptor >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  var desc = {};\n  if (descriptor) {\n    var requiredFeatureCount = HEAPU32[((descriptor + 12) >>> 2) >>> 0];\n    if (requiredFeatureCount) {\n      var requiredFeaturesPtr = HEAPU32[((descriptor + 16) >>> 2) >>> 0];\n      desc['requiredFeatures'] = Array.from(\n        HEAPU32.subarray(\n          (requiredFeaturesPtr >>> 2) >>> 0,\n          ((requiredFeaturesPtr + requiredFeatureCount * 4) >>> 2) >>> 0\n        ),\n        (feature) => WebGPU.FeatureName[feature]\n      );\n    }\n    var limitsPtr = HEAPU32[((descriptor + 20) >>> 2) >>> 0];\n    if (limitsPtr) {\n      var nextInChainPtr = HEAPU32[(limitsPtr >>> 2) >>> 0];\n      var requiredLimits = {};\n      function setLimitU32IfDefined(\n        name,\n        basePtr,\n        limitOffset,\n        ignoreIfZero = false\n      ) {\n        var ptr = basePtr + limitOffset;\n        var value = HEAPU32[(ptr >>> 2) >>> 0];\n        if (value != 4294967295 && (!ignoreIfZero || value != 0)) {\n          requiredLimits[name] = value;\n        }\n      }\n      function setLimitU64IfDefined(name, basePtr, limitOffset) {\n        var ptr = basePtr + limitOffset;\n        var limitPart1 = HEAPU32[(ptr >>> 2) >>> 0];\n        var limitPart2 = HEAPU32[((ptr + 4) >>> 2) >>> 0];\n        if (limitPart1 != 4294967295 || limitPart2 != 4294967295) {\n          requiredLimits[name] = readI53FromI64(ptr);\n        }\n      }\n      setLimitU32IfDefined('maxTextureDimension1D', limitsPtr, 4);\n      setLimitU32IfDefined('maxTextureDimension2D', limitsPtr, 8);\n      setLimitU32IfDefined('maxTextureDimension3D', limitsPtr, 12);\n      setLimitU32IfDefined('maxTextureArrayLayers', limitsPtr, 16);\n      setLimitU32IfDefined('maxBindGroups', limitsPtr, 20);\n      setLimitU32IfDefined('maxBindGroupsPlusVertexBuffers', limitsPtr, 24);\n      setLimitU32IfDefined('maxBindingsPerBindGroup', limitsPtr, 28);\n      setLimitU32IfDefined(\n        'maxDynamicUniformBuffersPerPipelineLayout',\n        limitsPtr,\n        32\n      );\n      setLimitU32IfDefined(\n        'maxDynamicStorageBuffersPerPipelineLayout',\n        limitsPtr,\n        36\n      );\n      setLimitU32IfDefined('maxSampledTexturesPerShaderStage', limitsPtr, 40);\n      setLimitU32IfDefined('maxSamplersPerShaderStage', limitsPtr, 44);\n      setLimitU32IfDefined('maxStorageBuffersPerShaderStage', limitsPtr, 48);\n      setLimitU32IfDefined('maxStorageTexturesPerShaderStage', limitsPtr, 52);\n      setLimitU32IfDefined('maxUniformBuffersPerShaderStage', limitsPtr, 56);\n      setLimitU32IfDefined('minUniformBufferOffsetAlignment', limitsPtr, 80);\n      setLimitU32IfDefined('minStorageBufferOffsetAlignment', limitsPtr, 84);\n      setLimitU64IfDefined('maxUniformBufferBindingSize', limitsPtr, 64);\n      setLimitU64IfDefined('maxStorageBufferBindingSize', limitsPtr, 72);\n      setLimitU32IfDefined('maxVertexBuffers', limitsPtr, 88);\n      setLimitU64IfDefined('maxBufferSize', limitsPtr, 96);\n      setLimitU32IfDefined('maxVertexAttributes', limitsPtr, 104);\n      setLimitU32IfDefined('maxVertexBufferArrayStride', limitsPtr, 108);\n      setLimitU32IfDefined('maxInterStageShaderVariables', limitsPtr, 112);\n      setLimitU32IfDefined('maxColorAttachments', limitsPtr, 116);\n      setLimitU32IfDefined('maxColorAttachmentBytesPerSample', limitsPtr, 120);\n      setLimitU32IfDefined('maxComputeWorkgroupStorageSize', limitsPtr, 124);\n      setLimitU32IfDefined('maxComputeInvocationsPerWorkgroup', limitsPtr, 128);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeX', limitsPtr, 132);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeY', limitsPtr, 136);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeZ', limitsPtr, 140);\n      setLimitU32IfDefined('maxComputeWorkgroupsPerDimension', limitsPtr, 144);\n      setLimitU32IfDefined('maxImmediateSize', limitsPtr, 148, true);\n      if (nextInChainPtr !== 0) {\n        var sType = HEAP32[((nextInChainPtr + 4) >>> 2) >>> 0];\n        var compatibilityModeLimitsPtr = nextInChainPtr;\n        if ('maxStorageBuffersInVertexStage' in GPUSupportedLimits.prototype) {\n          setLimitU32IfDefined(\n            'maxStorageBuffersInVertexStage',\n            compatibilityModeLimitsPtr,\n            8\n          );\n          setLimitU32IfDefined(\n            'maxStorageTexturesInVertexStage',\n            compatibilityModeLimitsPtr,\n            12\n          );\n          setLimitU32IfDefined(\n            'maxStorageBuffersInFragmentStage',\n            compatibilityModeLimitsPtr,\n            16\n          );\n          setLimitU32IfDefined(\n            'maxStorageTexturesInFragmentStage',\n            compatibilityModeLimitsPtr,\n            20\n          );\n        }\n      }\n      desc['requiredLimits'] = requiredLimits;\n    }\n    var defaultQueuePtr = HEAPU32[((descriptor + 24) >>> 2) >>> 0];\n    if (defaultQueuePtr) {\n      var defaultQueueDesc = {\n        label: WebGPU.makeStringFromOptionalStringView(defaultQueuePtr + 4),\n      };\n      desc['defaultQueue'] = defaultQueueDesc;\n    }\n    desc['label'] = WebGPU.makeStringFromOptionalStringView(descriptor + 4);\n  }\n  WebGPU.Internals.futureInsert(\n    futureId,\n    adapter.requestDevice(desc).then(\n      (device) => {\n        callUserCallback(() => {\n          WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);\n          WebGPU.Internals.jsObjectInsert(devicePtr, device);\n          WebGPU.Internals.futureInsert(\n            deviceLostFutureId,\n            device.lost.then((info) => {\n              callUserCallback(() => {\n                device.onuncapturederror = (ev) => {};\n                var sp = stackSave();\n                var messagePtr = stringToUTF8OnStack(info.message);\n                _emwgpuOnDeviceLostCompleted(\n                  deviceLostFutureId,\n                  emwgpuStringToInt_DeviceLostReason[info.reason],\n                  messagePtr\n                );\n                stackRestore(sp);\n              });\n            })\n          );\n          device.onuncapturederror = (ev) => {\n            var type = 5;\n            if (ev.error instanceof GPUValidationError) type = 2;\n            else if (ev.error instanceof GPUOutOfMemoryError) type = 3;\n            else if (ev.error instanceof GPUInternalError) type = 4;\n            var sp = stackSave();\n            var messagePtr = stringToUTF8OnStack(ev.error.message);\n            _emwgpuOnUncapturedError(devicePtr, type, messagePtr);\n            stackRestore(sp);\n          };\n          _emwgpuOnRequestDeviceCompleted(futureId, 1, devicePtr, 0);\n        });\n      },\n      (ex) => {\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          _emwgpuOnRequestDeviceCompleted(futureId, 3, devicePtr, messagePtr);\n          if (deviceLostFutureId) {\n            _emwgpuOnDeviceLostCompleted(deviceLostFutureId, 4, messagePtr);\n          }\n          stackRestore(sp);\n        });\n      }\n    )\n  );\n}\nfunction _emwgpuBufferDestroy(bufferPtr) {\n  bufferPtr >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  if (onUnmap) {\n    for (var i = 0; i < onUnmap.length; ++i) {\n      onUnmap[i]();\n    }\n    delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  }\n  buffer.destroy();\n}\nvar warnOnce = (text) => {\n  warnOnce.shown ||= {};\n  if (!warnOnce.shown[text]) {\n    warnOnce.shown[text] = 1;\n    if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;\n    err(text);\n  }\n};\nfunction _emwgpuBufferGetConstMappedRange(bufferPtr, offset, size) {\n  bufferPtr >>>= 0;\n  offset >>>= 0;\n  size >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  if (size == 4294967295) size = undefined;\n  var mapped;\n  try {\n    mapped = buffer.getMappedRange(offset, size);\n  } catch (ex) {\n    return 0;\n  }\n  var data = _memalign(16, mapped.byteLength);\n  HEAPU8.set(new Uint8Array(mapped), data >>> 0);\n  WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(() => _free(data));\n  return data;\n}\nvar _emwgpuBufferMapAsync = function (bufferPtr, futureId, mode, offset, size) {\n  bufferPtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  mode = bigintToI53Checked(mode);\n  offset >>>= 0;\n  size >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];\n  if (size == 4294967295) size = undefined;\n  WebGPU.Internals.futureInsert(\n    futureId,\n    buffer.mapAsync(mode, offset, size).then(\n      () => {\n        callUserCallback(() => {\n          _emwgpuOnMapAsyncCompleted(futureId, 1, 0);\n        });\n      },\n      (ex) => {\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          var status =\n            ex.name === 'AbortError' ? 4 : ex.name === 'OperationError' ? 3 : 0;\n          _emwgpuOnMapAsyncCompleted(futureId, status, messagePtr);\n          delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n        });\n      }\n    )\n  );\n};\nfunction _emwgpuBufferUnmap(bufferPtr) {\n  bufferPtr >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  if (!onUnmap) {\n    return;\n  }\n  for (var i = 0; i < onUnmap.length; ++i) {\n    onUnmap[i]();\n  }\n  delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  buffer.unmap();\n}\nfunction _emwgpuDelete(ptr) {\n  ptr >>>= 0;\n  delete WebGPU.Internals.jsObjects[ptr];\n}\nfunction _emwgpuDeviceCreateBuffer(devicePtr, descriptor, bufferPtr) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  bufferPtr >>>= 0;\n  var mappedAtCreation = !!HEAPU32[((descriptor + 32) >>> 2) >>> 0];\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    usage: HEAPU32[((descriptor + 16) >>> 2) >>> 0],\n    size: readI53FromI64(descriptor + 24),\n    mappedAtCreation,\n  };\n  var device = WebGPU.getJsObject(devicePtr);\n  var buffer;\n  try {\n    buffer = device.createBuffer(desc);\n  } catch (ex) {\n    return false;\n  }\n  WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);\n  if (mappedAtCreation) {\n    WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];\n  }\n  return true;\n}\nfunction _emwgpuDeviceCreateShaderModule(\n  devicePtr,\n  descriptor,\n  shaderModulePtr\n) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  shaderModulePtr >>>= 0;\n  var nextInChainPtr = HEAPU32[(descriptor >>> 2) >>> 0];\n  var sType = HEAP32[((nextInChainPtr + 4) >>> 2) >>> 0];\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    code: '',\n  };\n  switch (sType) {\n    case 2: {\n      desc['code'] = WebGPU.makeStringFromStringView(nextInChainPtr + 8);\n      break;\n    }\n  }\n  var device = WebGPU.getJsObject(devicePtr);\n  WebGPU.Internals.jsObjectInsert(\n    shaderModulePtr,\n    device.createShaderModule(desc)\n  );\n}\nvar _emwgpuDeviceDestroy = (devicePtr) => {\n  const device = WebGPU.getJsObject(devicePtr);\n  device.onuncapturederror = null;\n  device.destroy();\n};\nfunction _emwgpuInstanceRequestAdapter(\n  instancePtr,\n  futureId,\n  options,\n  adapterPtr\n) {\n  instancePtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  options >>>= 0;\n  adapterPtr >>>= 0;\n  var opts;\n  if (options) {\n    opts = {\n      featureLevel: WebGPU.FeatureLevel[HEAP32[((options + 4) >>> 2) >>> 0]],\n      powerPreference:\n        WebGPU.PowerPreference[HEAP32[((options + 8) >>> 2) >>> 0]],\n      forceFallbackAdapter: !!HEAPU32[((options + 12) >>> 2) >>> 0],\n    };\n    var nextInChainPtr = HEAPU32[(options >>> 2) >>> 0];\n    if (nextInChainPtr !== 0) {\n      var sType = HEAP32[((nextInChainPtr + 4) >>> 2) >>> 0];\n      var webxrOptions = nextInChainPtr;\n      opts.xrCompatible = !!HEAPU32[((webxrOptions + 8) >>> 2) >>> 0];\n    }\n  }\n  if (!('gpu' in navigator)) {\n    var sp = stackSave();\n    var messagePtr = stringToUTF8OnStack(\n      'WebGPU not available on this browser (navigator.gpu is not available)'\n    );\n    _emwgpuOnRequestAdapterCompleted(futureId, 3, adapterPtr, messagePtr);\n    stackRestore(sp);\n    return;\n  }\n  WebGPU.Internals.futureInsert(\n    futureId,\n    navigator.gpu.requestAdapter(opts).then(\n      (adapter) => {\n        callUserCallback(() => {\n          if (adapter) {\n            WebGPU.Internals.jsObjectInsert(adapterPtr, adapter);\n            _emwgpuOnRequestAdapterCompleted(futureId, 1, adapterPtr, 0);\n          } else {\n            var sp = stackSave();\n            var messagePtr = stringToUTF8OnStack(\n              'WebGPU not available on this browser (requestAdapter returned null)'\n            );\n            _emwgpuOnRequestAdapterCompleted(\n              futureId,\n              3,\n              adapterPtr,\n              messagePtr\n            );\n            stackRestore(sp);\n          }\n        });\n      },\n      (ex) => {\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          _emwgpuOnRequestAdapterCompleted(futureId, 4, adapterPtr, messagePtr);\n          stackRestore(sp);\n        });\n      }\n    )\n  );\n}\nvar _emwgpuQueueOnSubmittedWorkDone = function (queuePtr, futureId) {\n  queuePtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  var queue = WebGPU.getJsObject(queuePtr);\n  WebGPU.Internals.futureInsert(\n    futureId,\n    queue.onSubmittedWorkDone().then(() => {\n      callUserCallback(() => {\n        _emwgpuOnWorkDoneCompleted(futureId, 1);\n      });\n    })\n  );\n};\nvar _emwgpuWaitAny = function (futurePtr, futureCount, timeoutMSPtr) {\n  futurePtr >>>= 0;\n  futureCount >>>= 0;\n  timeoutMSPtr >>>= 0;\n  return Asyncify.handleAsync(async () => {\n    var promises = [];\n    if (timeoutMSPtr) {\n      var timeoutMS = HEAP32[(timeoutMSPtr >>> 2) >>> 0];\n      promises.length = futureCount + 1;\n      promises[futureCount] = new Promise((resolve) =>\n        setTimeout(resolve, timeoutMS, 0)\n      );\n    } else {\n      promises.length = futureCount;\n    }\n    for (var i = 0; i < futureCount; ++i) {\n      var futureId = readI53FromI64(futurePtr + i * 8);\n      if (!(futureId in WebGPU.Internals.futures)) {\n        return futureId;\n      }\n      promises[i] = WebGPU.Internals.futures[futureId];\n    }\n    const firstResolvedFuture = await Promise.race(promises);\n    delete WebGPU.Internals.futures[firstResolvedFuture];\n    return firstResolvedFuture;\n  });\n};\n_emwgpuWaitAny.isAsync = true;\nvar ENV = {};\nvar getExecutableName = () => thisProgram || './this.program';\nvar getEnvStrings = () => {\n  if (!getEnvStrings.strings) {\n    var lang =\n      ((typeof navigator == 'object' && navigator.language) || 'C').replace(\n        '-',\n        '_'\n      ) + '.UTF-8';\n    var env = {\n      USER: 'web_user',\n      LOGNAME: 'web_user',\n      PATH: '/',\n      PWD: '/',\n      HOME: '/home/web_user',\n      LANG: lang,\n      _: getExecutableName(),\n    };\n    for (var x in ENV) {\n      if (ENV[x] === undefined) delete env[x];\n      else env[x] = ENV[x];\n    }\n    var strings = [];\n    for (var x in env) {\n      strings.push(`${x}=${env[x]}`);\n    }\n    getEnvStrings.strings = strings;\n  }\n  return getEnvStrings.strings;\n};\nfunction _environ_get(__environ, environ_buf) {\n  __environ >>>= 0;\n  environ_buf >>>= 0;\n  var bufSize = 0;\n  var envp = 0;\n  for (var string of getEnvStrings()) {\n    var ptr = environ_buf + bufSize;\n    HEAPU32[((__environ + envp) >>> 2) >>> 0] = ptr;\n    bufSize += stringToUTF8(string, ptr, Infinity) + 1;\n    envp += 4;\n  }\n  return 0;\n}\nfunction _environ_sizes_get(penviron_count, penviron_buf_size) {\n  penviron_count >>>= 0;\n  penviron_buf_size >>>= 0;\n  var strings = getEnvStrings();\n  HEAPU32[(penviron_count >>> 2) >>> 0] = strings.length;\n  var bufSize = 0;\n  for (var string of strings) {\n    bufSize += lengthBytesUTF8(string) + 1;\n  }\n  HEAPU32[(penviron_buf_size >>> 2) >>> 0] = bufSize;\n  return 0;\n}\nfunction _fd_close(fd) {\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    FS.close(stream);\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar doReadv = (stream, iov, iovcnt, offset) => {\n  var ret = 0;\n  for (var i = 0; i < iovcnt; i++) {\n    var ptr = HEAPU32[(iov >>> 2) >>> 0];\n    var len = HEAPU32[((iov + 4) >>> 2) >>> 0];\n    iov += 8;\n    var curr = FS.read(stream, HEAP8, ptr, len, offset);\n    if (curr < 0) return -1;\n    ret += curr;\n    if (curr < len) break;\n    if (typeof offset != 'undefined') {\n      offset += curr;\n    }\n  }\n  return ret;\n};\nfunction _fd_read(fd, iov, iovcnt, pnum) {\n  iov >>>= 0;\n  iovcnt >>>= 0;\n  pnum >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var num = doReadv(stream, iov, iovcnt);\n    HEAPU32[(pnum >>> 2) >>> 0] = num;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nfunction _fd_seek(fd, offset, whence, newOffset) {\n  offset = bigintToI53Checked(offset);\n  newOffset >>>= 0;\n  try {\n    if (isNaN(offset)) return 61;\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    FS.llseek(stream, offset, whence);\n    HEAP64[(newOffset >>> 3) >>> 0] = BigInt(stream.position);\n    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar doWritev = (stream, iov, iovcnt, offset) => {\n  var ret = 0;\n  for (var i = 0; i < iovcnt; i++) {\n    var ptr = HEAPU32[(iov >>> 2) >>> 0];\n    var len = HEAPU32[((iov + 4) >>> 2) >>> 0];\n    iov += 8;\n    var curr = FS.write(stream, HEAP8, ptr, len, offset);\n    if (curr < 0) return -1;\n    ret += curr;\n    if (curr < len) {\n      break;\n    }\n    if (typeof offset != 'undefined') {\n      offset += curr;\n    }\n  }\n  return ret;\n};\nfunction _fd_write(fd, iov, iovcnt, pnum) {\n  iov >>>= 0;\n  iovcnt >>>= 0;\n  pnum >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var num = doWritev(stream, iov, iovcnt);\n    HEAPU32[(pnum >>> 2) >>> 0] = num;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nfunction _llvm_eh_typeid_for(type) {\n  type >>>= 0;\n  return type;\n}\nfunction _random_get(buffer, size) {\n  buffer >>>= 0;\n  size >>>= 0;\n  try {\n    randomFill(HEAPU8.subarray(buffer >>> 0, (buffer + size) >>> 0));\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar emwgpuStringToInt_FeatureName = {\n  'core-features-and-limits': 1,\n  'depth-clip-control': 2,\n  'depth32float-stencil8': 3,\n  'texture-compression-bc': 4,\n  'texture-compression-bc-sliced-3d': 5,\n  'texture-compression-etc2': 6,\n  'texture-compression-astc': 7,\n  'texture-compression-astc-sliced-3d': 8,\n  'timestamp-query': 9,\n  'indirect-first-instance': 10,\n  'shader-f16': 11,\n  'rg11b10ufloat-renderable': 12,\n  'bgra8unorm-storage': 13,\n  'float32-filterable': 14,\n  'float32-blendable': 15,\n  'clip-distances': 16,\n  'dual-source-blending': 17,\n  subgroups: 18,\n  'texture-formats-tier1': 19,\n  'texture-formats-tier2': 20,\n  'primitive-index': 21,\n  'texture-component-swizzle': 22,\n  'chromium-experimental-unorm16-texture-formats': 327692,\n  'chromium-experimental-multi-draw-indirect': 327729,\n};\nfunction _wgpuAdapterGetFeatures(adapterPtr, supportedFeatures) {\n  adapterPtr >>>= 0;\n  supportedFeatures >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  var featuresPtr = _malloc(adapter.features.size * 4);\n  var offset = 0;\n  var numFeatures = 0;\n  for (const feature of adapter.features) {\n    var featureEnumValue = emwgpuStringToInt_FeatureName[feature];\n    if (featureEnumValue >= 0) {\n      HEAP32[((featuresPtr + offset) >>> 2) >>> 0] = featureEnumValue;\n      offset += 4;\n      numFeatures++;\n    }\n  }\n  HEAPU32[((supportedFeatures + 4) >>> 2) >>> 0] = featuresPtr;\n  HEAPU32[(supportedFeatures >>> 2) >>> 0] = numFeatures;\n}\nfunction _wgpuAdapterGetInfo(adapterPtr, info) {\n  adapterPtr >>>= 0;\n  info >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  WebGPU.fillAdapterInfoStruct(adapter.info, info);\n  return 1;\n}\nfunction _wgpuAdapterGetLimits(adapterPtr, limitsOutPtr) {\n  adapterPtr >>>= 0;\n  limitsOutPtr >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  WebGPU.fillLimitStruct(adapter.limits, limitsOutPtr);\n  return 1;\n}\nfunction _wgpuAdapterHasFeature(adapterPtr, featureEnumValue) {\n  adapterPtr >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  return adapter.features.has(WebGPU.FeatureName[featureEnumValue]);\n}\nvar _wgpuBufferGetSize = function (bufferPtr) {\n  bufferPtr >>>= 0;\n  var ret = (() => {\n    var buffer = WebGPU.getJsObject(bufferPtr);\n    return buffer.size;\n  })();\n  return BigInt(ret);\n};\nfunction _wgpuCommandEncoderBeginComputePass(encoderPtr, descriptor) {\n  encoderPtr >>>= 0;\n  descriptor >>>= 0;\n  var desc;\n  if (descriptor) {\n    desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      timestampWrites: WebGPU.makePassTimestampWrites(\n        HEAPU32[((descriptor + 12) >>> 2) >>> 0]\n      ),\n    };\n  }\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var ptr = _emwgpuCreateComputePassEncoder(0);\n  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.beginComputePass(desc));\n  return ptr;\n}\nfunction _wgpuCommandEncoderCopyBufferToBuffer(\n  encoderPtr,\n  srcPtr,\n  srcOffset,\n  dstPtr,\n  dstOffset,\n  size\n) {\n  encoderPtr >>>= 0;\n  srcPtr >>>= 0;\n  srcOffset = bigintToI53Checked(srcOffset);\n  dstPtr >>>= 0;\n  dstOffset = bigintToI53Checked(dstOffset);\n  size = bigintToI53Checked(size);\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var src = WebGPU.getJsObject(srcPtr);\n  var dst = WebGPU.getJsObject(dstPtr);\n  commandEncoder.copyBufferToBuffer(src, srcOffset, dst, dstOffset, size);\n}\nfunction _wgpuCommandEncoderFinish(encoderPtr, descriptor) {\n  encoderPtr >>>= 0;\n  descriptor >>>= 0;\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var ptr = _emwgpuCreateCommandBuffer(0);\n  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.finish());\n  return ptr;\n}\nfunction _wgpuComputePassEncoderDispatchWorkgroups(passPtr, x, y, z) {\n  passPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  pass.dispatchWorkgroups(x, y, z);\n}\nfunction _wgpuComputePassEncoderEnd(passPtr) {\n  passPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  pass.end();\n}\nfunction _wgpuComputePassEncoderSetBindGroup(\n  passPtr,\n  groupIndex,\n  groupPtr,\n  dynamicOffsetCount,\n  dynamicOffsetsPtr\n) {\n  passPtr >>>= 0;\n  groupPtr >>>= 0;\n  dynamicOffsetCount >>>= 0;\n  dynamicOffsetsPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  var group = WebGPU.getJsObject(groupPtr);\n  if (dynamicOffsetCount == 0) {\n    pass.setBindGroup(groupIndex, group);\n  } else {\n    pass.setBindGroup(\n      groupIndex,\n      group,\n      HEAPU32,\n      dynamicOffsetsPtr >>> 2,\n      dynamicOffsetCount\n    );\n  }\n}\nfunction _wgpuComputePassEncoderSetPipeline(passPtr, pipelinePtr) {\n  passPtr >>>= 0;\n  pipelinePtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  var pipeline = WebGPU.getJsObject(pipelinePtr);\n  pass.setPipeline(pipeline);\n}\nfunction _wgpuComputePipelineGetBindGroupLayout(pipelinePtr, groupIndex) {\n  pipelinePtr >>>= 0;\n  var pipeline = WebGPU.getJsObject(pipelinePtr);\n  var ptr = _emwgpuCreateBindGroupLayout(0);\n  WebGPU.Internals.jsObjectInsert(ptr, pipeline.getBindGroupLayout(groupIndex));\n  return ptr;\n}\nvar _wgpuDeviceCreateBindGroup = function (devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  function makeEntry(entryPtr) {\n    var bufferPtr = HEAPU32[((entryPtr + 8) >>> 2) >>> 0];\n    var samplerPtr = HEAPU32[((entryPtr + 32) >>> 2) >>> 0];\n    var textureViewPtr = HEAPU32[((entryPtr + 36) >>> 2) >>> 0];\n    var externalTexturePtr = 0;\n    WebGPU.iterateExtensions(entryPtr, {\n      327681: (ptr) => {\n        externalTexturePtr = HEAPU32[((ptr + 8) >>> 2) >>> 0];\n      },\n    });\n    var resource;\n    if (bufferPtr) {\n      var size = readI53FromI64(entryPtr + 24);\n      if (size == -1) size = undefined;\n      resource = {\n        buffer: WebGPU.getJsObject(bufferPtr),\n        offset: readI53FromI64(entryPtr + 16),\n        size,\n      };\n    } else {\n      resource = WebGPU.getJsObject(\n        samplerPtr || textureViewPtr || externalTexturePtr\n      );\n    }\n    return { binding: HEAPU32[((entryPtr + 4) >>> 2) >>> 0], resource };\n  }\n  function makeEntries(count, entriesPtrs) {\n    var entries = [];\n    for (var i = 0; i < count; ++i) {\n      entries.push(makeEntry(entriesPtrs + 40 * i));\n    }\n    return entries;\n  }\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    layout: WebGPU.getJsObject(HEAPU32[((descriptor + 12) >>> 2) >>> 0]),\n    entries: makeEntries(\n      HEAPU32[((descriptor + 16) >>> 2) >>> 0],\n      HEAPU32[((descriptor + 20) >>> 2) >>> 0]\n    ),\n  };\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateBindGroup(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroup(desc));\n  return ptr;\n};\nfunction _wgpuDeviceCreateCommandEncoder(devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  var desc;\n  if (descriptor) {\n    desc = { label: WebGPU.makeStringFromOptionalStringView(descriptor + 4) };\n  }\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateCommandEncoder(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createCommandEncoder(desc));\n  return ptr;\n}\nfunction _wgpuDeviceCreateComputePipeline(devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  var desc = WebGPU.makeComputePipelineDesc(descriptor);\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateComputePipeline(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createComputePipeline(desc));\n  return ptr;\n}\nvar _wgpuQueueSubmit = function (queuePtr, commandCount, commands) {\n  queuePtr >>>= 0;\n  commandCount >>>= 0;\n  commands >>>= 0;\n  var queue = WebGPU.getJsObject(queuePtr);\n  var cmds = Array.from(\n    HEAP32.subarray(\n      (commands >>> 2) >>> 0,\n      ((commands + commandCount * 4) >>> 2) >>> 0\n    ),\n    (id) => WebGPU.getJsObject(id)\n  );\n  queue.submit(cmds);\n};\nfunction _wgpuQueueWriteBuffer(queuePtr, bufferPtr, bufferOffset, data, size) {\n  queuePtr >>>= 0;\n  bufferPtr >>>= 0;\n  bufferOffset = bigintToI53Checked(bufferOffset);\n  data >>>= 0;\n  size >>>= 0;\n  var queue = WebGPU.getJsObject(queuePtr);\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var subarray = HEAPU8.subarray(data >>> 0, (data + size) >>> 0);\n  queue.writeBuffer(buffer, bufferOffset, subarray, 0, size);\n}\nvar runAndAbortIfError = (func) => {\n  try {\n    return func();\n  } catch (e) {\n    abort(e);\n  }\n};\nvar runtimeKeepalivePush = () => {\n  runtimeKeepaliveCounter += 1;\n};\nvar runtimeKeepalivePop = () => {\n  runtimeKeepaliveCounter -= 1;\n};\nvar Asyncify = {\n  instrumentWasmImports(imports) {\n    var importPattern = /^(invoke_.*|__asyncjs__.*)$/;\n    for (let [x, original] of Object.entries(imports)) {\n      if (typeof original == 'function') {\n        let isAsyncifyImport = original.isAsync || importPattern.test(x);\n      }\n    }\n  },\n  instrumentFunction(original) {\n    var wrapper = (...args) => {\n      Asyncify.exportCallStack.push(original);\n      try {\n        return original(...args);\n      } finally {\n        if (!ABORT) {\n          var top = Asyncify.exportCallStack.pop();\n          Asyncify.maybeStopUnwind();\n        }\n      }\n    };\n    Asyncify.funcWrappers.set(original, wrapper);\n    return wrapper;\n  },\n  instrumentWasmExports(exports) {\n    var ret = {};\n    for (let [x, original] of Object.entries(exports)) {\n      if (typeof original == 'function') {\n        var wrapper = Asyncify.instrumentFunction(original);\n        ret[x] = wrapper;\n      } else {\n        ret[x] = original;\n      }\n    }\n    return ret;\n  },\n  State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 },\n  state: 0,\n  StackSize: 4096,\n  currData: null,\n  handleSleepReturnValue: 0,\n  exportCallStack: [],\n  callstackFuncToId: new Map(),\n  callStackIdToFunc: new Map(),\n  funcWrappers: new Map(),\n  callStackId: 0,\n  asyncPromiseHandlers: null,\n  sleepCallbacks: [],\n  getCallStackId(func) {\n    if (!Asyncify.callstackFuncToId.has(func)) {\n      var id = Asyncify.callStackId++;\n      Asyncify.callstackFuncToId.set(func, id);\n      Asyncify.callStackIdToFunc.set(id, func);\n    }\n    return Asyncify.callstackFuncToId.get(func);\n  },\n  maybeStopUnwind() {\n    if (\n      Asyncify.currData &&\n      Asyncify.state === Asyncify.State.Unwinding &&\n      Asyncify.exportCallStack.length === 0\n    ) {\n      Asyncify.state = Asyncify.State.Normal;\n      runAndAbortIfError(_asyncify_stop_unwind);\n      if (typeof Fibers != 'undefined') {\n        Fibers.trampoline();\n      }\n    }\n  },\n  whenDone() {\n    return new Promise((resolve, reject) => {\n      Asyncify.asyncPromiseHandlers = { resolve, reject };\n    });\n  },\n  allocateData() {\n    var ptr = _malloc(12 + Asyncify.StackSize);\n    Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);\n    Asyncify.setDataRewindFunc(ptr);\n    return ptr;\n  },\n  setDataHeader(ptr, stack, stackSize) {\n    HEAPU32[(ptr >>> 2) >>> 0] = stack;\n    HEAPU32[((ptr + 4) >>> 2) >>> 0] = stack + stackSize;\n  },\n  setDataRewindFunc(ptr) {\n    var bottomOfCallStack = Asyncify.exportCallStack[0];\n    var rewindId = Asyncify.getCallStackId(bottomOfCallStack);\n    HEAP32[((ptr + 8) >>> 2) >>> 0] = rewindId;\n  },\n  getDataRewindFunc(ptr) {\n    var id = HEAP32[((ptr + 8) >>> 2) >>> 0];\n    var func = Asyncify.callStackIdToFunc.get(id);\n    return func;\n  },\n  doRewind(ptr) {\n    var original = Asyncify.getDataRewindFunc(ptr);\n    var func = Asyncify.funcWrappers.get(original);\n    return func();\n  },\n  handleSleep(startAsync) {\n    if (ABORT) return;\n    if (Asyncify.state === Asyncify.State.Normal) {\n      var reachedCallback = false;\n      var reachedAfterCallback = false;\n      startAsync((handleSleepReturnValue = 0) => {\n        if (ABORT) return;\n        Asyncify.handleSleepReturnValue = handleSleepReturnValue;\n        reachedCallback = true;\n        if (!reachedAfterCallback) {\n          return;\n        }\n        Asyncify.state = Asyncify.State.Rewinding;\n        runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));\n        if (typeof MainLoop != 'undefined' && MainLoop.func) {\n          MainLoop.resume();\n        }\n        var asyncWasmReturnValue,\n          isError = false;\n        try {\n          asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);\n        } catch (err) {\n          asyncWasmReturnValue = err;\n          isError = true;\n        }\n        var handled = false;\n        if (!Asyncify.currData) {\n          var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;\n          if (asyncPromiseHandlers) {\n            Asyncify.asyncPromiseHandlers = null;\n            (isError\n              ? asyncPromiseHandlers.reject\n              : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);\n            handled = true;\n          }\n        }\n        if (isError && !handled) {\n          throw asyncWasmReturnValue;\n        }\n      });\n      reachedAfterCallback = true;\n      if (!reachedCallback) {\n        Asyncify.state = Asyncify.State.Unwinding;\n        Asyncify.currData = Asyncify.allocateData();\n        if (typeof MainLoop != 'undefined' && MainLoop.func) {\n          MainLoop.pause();\n        }\n        runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData));\n      }\n    } else if (Asyncify.state === Asyncify.State.Rewinding) {\n      Asyncify.state = Asyncify.State.Normal;\n      runAndAbortIfError(_asyncify_stop_rewind);\n      _free(Asyncify.currData);\n      Asyncify.currData = null;\n      Asyncify.sleepCallbacks.forEach(callUserCallback);\n    } else {\n      abort(`invalid state: ${Asyncify.state}`);\n    }\n    return Asyncify.handleSleepReturnValue;\n  },\n  handleAsync: (startAsync) =>\n    Asyncify.handleSleep((wakeUp) => {\n      startAsync().then(wakeUp);\n    }),\n};\nvar getCFunc = (ident) => {\n  var func = Module['_' + ident];\n  return func;\n};\nvar writeArrayToMemory = (array, buffer) => {\n  HEAP8.set(array, buffer >>> 0);\n};\nvar ccall = (ident, returnType, argTypes, args, opts) => {\n  var toC = {\n    string: (str) => {\n      var ret = 0;\n      if (str !== null && str !== undefined && str !== 0) {\n        ret = stringToUTF8OnStack(str);\n      }\n      return ret;\n    },\n    array: (arr) => {\n      var ret = stackAlloc(arr.length);\n      writeArrayToMemory(arr, ret);\n      return ret;\n    },\n  };\n  function convertReturnValue(ret) {\n    if (returnType === 'string') {\n      return UTF8ToString(ret);\n    }\n    if (returnType === 'pointer') return ret >>> 0;\n    if (returnType === 'boolean') return Boolean(ret);\n    return ret;\n  }\n  var func = getCFunc(ident);\n  var cArgs = [];\n  var stack = 0;\n  if (args) {\n    for (var i = 0; i < args.length; i++) {\n      var converter = toC[argTypes[i]];\n      if (converter) {\n        if (stack === 0) stack = stackSave();\n        cArgs[i] = converter(args[i]);\n      } else {\n        cArgs[i] = args[i];\n      }\n    }\n  }\n  var previousAsync = Asyncify.currData;\n  var ret = func(...cArgs);\n  function onDone(ret) {\n    runtimeKeepalivePop();\n    if (stack !== 0) stackRestore(stack);\n    return convertReturnValue(ret);\n  }\n  var asyncMode = opts?.async;\n  runtimeKeepalivePush();\n  if (Asyncify.currData != previousAsync) {\n    return Asyncify.whenDone().then(onDone);\n  }\n  ret = onDone(ret);\n  if (asyncMode) return Promise.resolve(ret);\n  return ret;\n};\nvar cwrap = (ident, returnType, argTypes, opts) => {\n  var numericArgs =\n    !argTypes ||\n    argTypes.every((type) => type === 'number' || type === 'boolean');\n  var numericRet = returnType !== 'string';\n  if (numericRet && numericArgs && !opts) {\n    return getCFunc(ident);\n  }\n  return (...args) => ccall(ident, returnType, argTypes, args, opts);\n};\nvar FS_createPath = (...args) => FS.createPath(...args);\nvar FS_unlink = (...args) => FS.unlink(...args);\nvar FS_createLazyFile = (...args) => FS.createLazyFile(...args);\nvar FS_createDevice = (...args) => FS.createDevice(...args);\nFS.createPreloadedFile = FS_createPreloadedFile;\nFS.preloadFile = FS_preloadFile;\nFS.staticInit();\n{\n  initMemory();\n  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];\n  if (Module['preloadPlugins']) preloadPlugins = Module['preloadPlugins'];\n  if (Module['print']) out = Module['print'];\n  if (Module['printErr']) err = Module['printErr'];\n  if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];\n  if (Module['arguments']) arguments_ = Module['arguments'];\n  if (Module['thisProgram']) thisProgram = Module['thisProgram'];\n  if (Module['preInit']) {\n    if (typeof Module['preInit'] == 'function')\n      Module['preInit'] = [Module['preInit']];\n    while (Module['preInit'].length > 0) {\n      Module['preInit'].shift()();\n    }\n  }\n}\nModule['mmapAlloc'] = mmapAlloc;\nModule['addRunDependency'] = addRunDependency;\nModule['removeRunDependency'] = removeRunDependency;\nModule['ccall'] = ccall;\nModule['cwrap'] = cwrap;\nModule['FS_preloadFile'] = FS_preloadFile;\nModule['FS_unlink'] = FS_unlink;\nModule['FS_createPath'] = FS_createPath;\nModule['FS_createDevice'] = FS_createDevice;\nModule['FS'] = FS;\nModule['FS_createDataFile'] = FS_createDataFile;\nModule['FS_createLazyFile'] = FS_createLazyFile;\nModule['MEMFS'] = MEMFS;\nvar _wllama_malloc,\n  _wllama_start,\n  _wllama_action,\n  _wllama_exit,\n  _wllama_debug,\n  _main,\n  _malloc,\n  _free,\n  _emwgpuCreateBindGroup,\n  _emwgpuCreateBindGroupLayout,\n  _emwgpuCreateCommandBuffer,\n  _emwgpuCreateCommandEncoder,\n  _emwgpuCreateComputePassEncoder,\n  _emwgpuCreateComputePipeline,\n  _emwgpuCreateExternalTexture,\n  _emwgpuCreatePipelineLayout,\n  _emwgpuCreateQuerySet,\n  _emwgpuCreateRenderBundle,\n  _emwgpuCreateRenderBundleEncoder,\n  _emwgpuCreateRenderPassEncoder,\n  _emwgpuCreateRenderPipeline,\n  _emwgpuCreateSampler,\n  _emwgpuCreateSurface,\n  _emwgpuCreateTexture,\n  _emwgpuCreateTextureView,\n  _emwgpuCreateAdapter,\n  _emwgpuCreateBuffer,\n  _emwgpuCreateDevice,\n  _emwgpuCreateQueue,\n  _emwgpuCreateShaderModule,\n  _emwgpuOnDeviceLostCompleted,\n  _emwgpuOnMapAsyncCompleted,\n  _emwgpuOnRequestAdapterCompleted,\n  _emwgpuOnRequestDeviceCompleted,\n  _emwgpuOnWorkDoneCompleted,\n  _emwgpuOnUncapturedError,\n  _emscripten_builtin_memalign,\n  __emscripten_timeout,\n  _memalign,\n  _setThrew,\n  __emscripten_tempret_set,\n  __emscripten_stack_restore,\n  __emscripten_stack_alloc,\n  _emscripten_stack_get_current,\n  ___cxa_decrement_exception_refcount,\n  ___cxa_increment_exception_refcount,\n  ___cxa_can_catch,\n  ___cxa_get_exception_ptr,\n  dynCall_v,\n  dynCall_ii,\n  dynCall_iii,\n  dynCall_viii,\n  dynCall_viiiii,\n  dynCall_vii,\n  dynCall_vi,\n  dynCall_iiiiiii,\n  dynCall_iiiii,\n  dynCall_iiiiii,\n  dynCall_viiiiii,\n  dynCall_vij,\n  dynCall_jii,\n  dynCall_viiii,\n  dynCall_iiii,\n  dynCall_iiiiiiii,\n  dynCall_iifff,\n  dynCall_iiiffiiii,\n  dynCall_ifi,\n  dynCall_iiiiiiiiiiiiii,\n  dynCall_iiiiiiiii,\n  dynCall_iiiiiiiiiiiiiiiiii,\n  dynCall_iiiiiiiiiiiiiii,\n  dynCall_iij,\n  dynCall_iiiiff,\n  dynCall_viijj,\n  dynCall_iiif,\n  dynCall_iiiiiiiiiiii,\n  dynCall_viif,\n  dynCall_viid,\n  dynCall_iiijj,\n  dynCall_iiijjjj,\n  dynCall_iiiiiiiiiffffffi,\n  dynCall_iiij,\n  dynCall_ji,\n  dynCall_iiiiiiiiii,\n  dynCall_j,\n  dynCall_viiiijjji,\n  dynCall_iiiiiiiiiifi,\n  dynCall_iiiiiiiiiiiijjiifiiiiiii,\n  dynCall_iiiiiiiiiiiiiiii,\n  dynCall_iiijjj,\n  dynCall_iiiiiiiiifi,\n  dynCall_iiiff,\n  dynCall_iiiiiiji,\n  dynCall_iiiiijiiijjjjjjj,\n  dynCall_viiiiiiiii,\n  dynCall_i,\n  dynCall_vj,\n  dynCall_viijii,\n  dynCall_viijijj,\n  dynCall_viiiij,\n  dynCall_viiij,\n  dynCall_viiiiiii,\n  dynCall_iiid,\n  dynCall_jiji,\n  dynCall_iidiiii,\n  dynCall_iiiij,\n  dynCall_iiiiij,\n  dynCall_viiiiiiiiii,\n  dynCall_viiiiiiiiiiiiiii,\n  dynCall_viij,\n  dynCall_viiiiiiii,\n  dynCall_viji,\n  dynCall_iiiiid,\n  dynCall_iiiiijj,\n  dynCall_iiiiiijj,\n  _asyncify_start_unwind,\n  _asyncify_stop_unwind,\n  _asyncify_start_rewind,\n  _asyncify_stop_rewind,\n  __indirect_function_table,\n  wasmTable;\nfunction assignWasmExports(wasmExports) {\n  _wllama_malloc = Module['_wllama_malloc'] = wasmExports['ub'];\n  _wllama_start = Module['_wllama_start'] = wasmExports['vb'];\n  _wllama_action = Module['_wllama_action'] = wasmExports['wb'];\n  _wllama_exit = Module['_wllama_exit'] = wasmExports['xb'];\n  _wllama_debug = Module['_wllama_debug'] = wasmExports['yb'];\n  _main = Module['_main'] = wasmExports['zb'];\n  _malloc = wasmExports['Ab'];\n  _free = wasmExports['Bb'];\n  _emwgpuCreateBindGroup = wasmExports['Cb'];\n  _emwgpuCreateBindGroupLayout = wasmExports['Db'];\n  _emwgpuCreateCommandBuffer = wasmExports['Eb'];\n  _emwgpuCreateCommandEncoder = wasmExports['Fb'];\n  _emwgpuCreateComputePassEncoder = wasmExports['Gb'];\n  _emwgpuCreateComputePipeline = wasmExports['Hb'];\n  _emwgpuCreateExternalTexture = wasmExports['Ib'];\n  _emwgpuCreatePipelineLayout = wasmExports['Jb'];\n  _emwgpuCreateQuerySet = wasmExports['Kb'];\n  _emwgpuCreateRenderBundle = wasmExports['Lb'];\n  _emwgpuCreateRenderBundleEncoder = wasmExports['Mb'];\n  _emwgpuCreateRenderPassEncoder = wasmExports['Nb'];\n  _emwgpuCreateRenderPipeline = wasmExports['Ob'];\n  _emwgpuCreateSampler = wasmExports['Pb'];\n  _emwgpuCreateSurface = wasmExports['Qb'];\n  _emwgpuCreateTexture = wasmExports['Rb'];\n  _emwgpuCreateTextureView = wasmExports['Sb'];\n  _emwgpuCreateAdapter = wasmExports['Tb'];\n  _emwgpuCreateBuffer = wasmExports['Ub'];\n  _emwgpuCreateDevice = wasmExports['Vb'];\n  _emwgpuCreateQueue = wasmExports['Wb'];\n  _emwgpuCreateShaderModule = wasmExports['Xb'];\n  _emwgpuOnDeviceLostCompleted = wasmExports['Yb'];\n  _emwgpuOnMapAsyncCompleted = wasmExports['Zb'];\n  _emwgpuOnRequestAdapterCompleted = wasmExports['_b'];\n  _emwgpuOnRequestDeviceCompleted = wasmExports['$b'];\n  _emwgpuOnWorkDoneCompleted = wasmExports['ac'];\n  _emwgpuOnUncapturedError = wasmExports['bc'];\n  _emscripten_builtin_memalign = wasmExports['dc'];\n  __emscripten_timeout = wasmExports['ec'];\n  _memalign = wasmExports['fc'];\n  _setThrew = wasmExports['gc'];\n  __emscripten_tempret_set = wasmExports['hc'];\n  __emscripten_stack_restore = wasmExports['ic'];\n  __emscripten_stack_alloc = wasmExports['jc'];\n  _emscripten_stack_get_current = wasmExports['kc'];\n  ___cxa_decrement_exception_refcount = wasmExports['lc'];\n  ___cxa_increment_exception_refcount = wasmExports['mc'];\n  ___cxa_can_catch = wasmExports['nc'];\n  ___cxa_get_exception_ptr = wasmExports['oc'];\n  dynCall_v = dynCalls['v'] = wasmExports['pc'];\n  dynCall_ii = dynCalls['ii'] = wasmExports['qc'];\n  dynCall_iii = dynCalls['iii'] = wasmExports['rc'];\n  dynCall_viii = dynCalls['viii'] = wasmExports['sc'];\n  dynCall_viiiii = dynCalls['viiiii'] = wasmExports['tc'];\n  dynCall_vii = dynCalls['vii'] = wasmExports['uc'];\n  dynCall_vi = dynCalls['vi'] = wasmExports['vc'];\n  dynCall_iiiiiii = dynCalls['iiiiiii'] = wasmExports['wc'];\n  dynCall_iiiii = dynCalls['iiiii'] = wasmExports['xc'];\n  dynCall_iiiiii = dynCalls['iiiiii'] = wasmExports['yc'];\n  dynCall_viiiiii = dynCalls['viiiiii'] = wasmExports['zc'];\n  dynCall_vij = dynCalls['vij'] = wasmExports['Ac'];\n  dynCall_jii = dynCalls['jii'] = wasmExports['Bc'];\n  dynCall_viiii = dynCalls['viiii'] = wasmExports['Cc'];\n  dynCall_iiii = dynCalls['iiii'] = wasmExports['Dc'];\n  dynCall_iiiiiiii = dynCalls['iiiiiiii'] = wasmExports['Ec'];\n  dynCall_iifff = dynCalls['iifff'] = wasmExports['Fc'];\n  dynCall_iiiffiiii = dynCalls['iiiffiiii'] = wasmExports['Gc'];\n  dynCall_ifi = dynCalls['ifi'] = wasmExports['Hc'];\n  dynCall_iiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiii'] = wasmExports['Ic'];\n  dynCall_iiiiiiiii = dynCalls['iiiiiiiii'] = wasmExports['Jc'];\n  dynCall_iiiiiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiiiiii'] =\n    wasmExports['Kc'];\n  dynCall_iiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiii'] = wasmExports['Lc'];\n  dynCall_iij = dynCalls['iij'] = wasmExports['Mc'];\n  dynCall_iiiiff = dynCalls['iiiiff'] = wasmExports['Nc'];\n  dynCall_viijj = dynCalls['viijj'] = wasmExports['Oc'];\n  dynCall_iiif = dynCalls['iiif'] = wasmExports['Pc'];\n  dynCall_iiiiiiiiiiii = dynCalls['iiiiiiiiiiii'] = wasmExports['Qc'];\n  dynCall_viif = dynCalls['viif'] = wasmExports['Rc'];\n  dynCall_viid = dynCalls['viid'] = wasmExports['Sc'];\n  dynCall_iiijj = dynCalls['iiijj'] = wasmExports['Tc'];\n  dynCall_iiijjjj = dynCalls['iiijjjj'] = wasmExports['Uc'];\n  dynCall_iiiiiiiiiffffffi = dynCalls['iiiiiiiiiffffffi'] = wasmExports['Vc'];\n  dynCall_iiij = dynCalls['iiij'] = wasmExports['Wc'];\n  dynCall_ji = dynCalls['ji'] = wasmExports['Xc'];\n  dynCall_iiiiiiiiii = dynCalls['iiiiiiiiii'] = wasmExports['Yc'];\n  dynCall_j = dynCalls['j'] = wasmExports['Zc'];\n  dynCall_viiiijjji = dynCalls['viiiijjji'] = wasmExports['_c'];\n  dynCall_iiiiiiiiiifi = dynCalls['iiiiiiiiiifi'] = wasmExports['$c'];\n  dynCall_iiiiiiiiiiiijjiifiiiiiii = dynCalls['iiiiiiiiiiiijjiifiiiiiii'] =\n    wasmExports['ad'];\n  dynCall_iiiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiiii'] = wasmExports['bd'];\n  dynCall_iiijjj = dynCalls['iiijjj'] = wasmExports['cd'];\n  dynCall_iiiiiiiiifi = dynCalls['iiiiiiiiifi'] = wasmExports['dd'];\n  dynCall_iiiff = dynCalls['iiiff'] = wasmExports['ed'];\n  dynCall_iiiiiiji = dynCalls['iiiiiiji'] = wasmExports['fd'];\n  dynCall_iiiiijiiijjjjjjj = dynCalls['iiiiijiiijjjjjjj'] = wasmExports['gd'];\n  dynCall_viiiiiiiii = dynCalls['viiiiiiiii'] = wasmExports['hd'];\n  dynCall_i = dynCalls['i'] = wasmExports['id'];\n  dynCall_vj = dynCalls['vj'] = wasmExports['jd'];\n  dynCall_viijii = dynCalls['viijii'] = wasmExports['kd'];\n  dynCall_viijijj = dynCalls['viijijj'] = wasmExports['ld'];\n  dynCall_viiiij = dynCalls['viiiij'] = wasmExports['md'];\n  dynCall_viiij = dynCalls['viiij'] = wasmExports['nd'];\n  dynCall_viiiiiii = dynCalls['viiiiiii'] = wasmExports['od'];\n  dynCall_iiid = dynCalls['iiid'] = wasmExports['pd'];\n  dynCall_jiji = dynCalls['jiji'] = wasmExports['qd'];\n  dynCall_iidiiii = dynCalls['iidiiii'] = wasmExports['rd'];\n  dynCall_iiiij = dynCalls['iiiij'] = wasmExports['sd'];\n  dynCall_iiiiij = dynCalls['iiiiij'] = wasmExports['td'];\n  dynCall_viiiiiiiiii = dynCalls['viiiiiiiiii'] = wasmExports['ud'];\n  dynCall_viiiiiiiiiiiiiii = dynCalls['viiiiiiiiiiiiiii'] = wasmExports['vd'];\n  dynCall_viij = dynCalls['viij'] = wasmExports['wd'];\n  dynCall_viiiiiiii = dynCalls['viiiiiiii'] = wasmExports['xd'];\n  dynCall_viji = dynCalls['viji'] = wasmExports['yd'];\n  dynCall_iiiiid = dynCalls['iiiiid'] = wasmExports['zd'];\n  dynCall_iiiiijj = dynCalls['iiiiijj'] = wasmExports['Ad'];\n  dynCall_iiiiiijj = dynCalls['iiiiiijj'] = wasmExports['Bd'];\n  _asyncify_start_unwind = wasmExports['Cd'];\n  _asyncify_stop_unwind = wasmExports['Dd'];\n  _asyncify_start_rewind = wasmExports['Ed'];\n  _asyncify_stop_rewind = wasmExports['Fd'];\n  __indirect_function_table = wasmTable = wasmExports['cc'];\n}\nvar wasmImports = {\n  w: ___cxa_begin_catch,\n  Ea: ___cxa_current_primary_exception,\n  F: ___cxa_end_catch,\n  b: ___cxa_find_matching_catch_2,\n  n: ___cxa_find_matching_catch_3,\n  J: ___cxa_find_matching_catch_4,\n  _: ___cxa_rethrow,\n  Da: ___cxa_rethrow_primary_exception,\n  x: ___cxa_throw,\n  Fa: ___cxa_uncaught_exceptions,\n  i: ___resumeException,\n  ha: ___syscall_fcntl64,\n  Ca: ___syscall_getcwd,\n  Ga: ___syscall_getdents64,\n  Ra: ___syscall_ioctl,\n  ia: ___syscall_openat,\n  Ba: ___syscall_stat64,\n  Va: __abort_js,\n  xa: __emscripten_runtime_keepalive_clear,\n  Ka: __mmap_js,\n  La: __munmap_js,\n  za: __setitimer_js,\n  Ma: __tzset_js,\n  Ua: _clock_time_get,\n  Ta: _emscripten_date_now,\n  Ia: _emscripten_get_heap_max,\n  Wa: _emscripten_has_asyncify,\n  Ha: _emscripten_resize_heap,\n  Ya: _emwgpuAdapterRequestDevice,\n  O: _emwgpuBufferDestroy,\n  ab: _emwgpuBufferGetConstMappedRange,\n  $a: _emwgpuBufferMapAsync,\n  _a: _emwgpuBufferUnmap,\n  m: _emwgpuDelete,\n  R: _emwgpuDeviceCreateBuffer,\n  la: _emwgpuDeviceCreateShaderModule,\n  Za: _emwgpuDeviceDestroy,\n  ka: _emwgpuInstanceRequestAdapter,\n  ja: _emwgpuQueueOnSubmittedWorkDone,\n  Xa: _emwgpuWaitAny,\n  Oa: _environ_get,\n  Pa: _environ_sizes_get,\n  V: _fd_close,\n  ga: _fd_read,\n  Na: _fd_seek,\n  Qa: _fd_write,\n  qa: invoke_i,\n  ca: invoke_ifi,\n  c: invoke_ii,\n  ta: invoke_iifff,\n  e: invoke_iii,\n  ma: invoke_iiid,\n  y: invoke_iiif,\n  sb: invoke_iiiff,\n  fa: invoke_iiiffiiii,\n  g: invoke_iiii,\n  pa: invoke_iiiiff,\n  k: invoke_iiiii,\n  r: invoke_iiiiii,\n  j: invoke_iiiiiii,\n  I: invoke_iiiiiiii,\n  Q: invoke_iiiiiiiii,\n  p: invoke_iiiiiiiiiffffffi,\n  aa: invoke_iiiiiiiiifi,\n  C: invoke_iiiiiiiiii,\n  t: invoke_iiiiiiiiiifi,\n  E: invoke_iiiiiiiiiiii,\n  sa: invoke_iiiiiiiiiiiiii,\n  P: invoke_iiiiiiiiiiiiiii,\n  s: invoke_iiiiiiiiiiiiiiii,\n  ea: invoke_iiiiiiiiiiiiiiiiii,\n  A: invoke_iiiiiiiiiiiijjiifiiiiiii,\n  oa: invoke_iiiiiiji,\n  mb: invoke_iiiiij,\n  $: invoke_iiiiijiiijjjjjjj,\n  nb: invoke_iiiij,\n  M: invoke_iiij,\n  B: invoke_iiijj,\n  v: invoke_iiijjj,\n  D: invoke_iiijjjj,\n  T: invoke_iij,\n  pb: invoke_j,\n  L: invoke_ji,\n  U: invoke_jii,\n  f: invoke_v,\n  q: invoke_vi,\n  l: invoke_vii,\n  kb: invoke_viid,\n  lb: invoke_viif,\n  h: invoke_viii,\n  o: invoke_viiii,\n  d: invoke_viiiii,\n  N: invoke_viiiiii,\n  H: invoke_viiiiiii,\n  Z: invoke_viiiiiiiii,\n  S: invoke_viiiiiiiiii,\n  W: invoke_viiiiiiiiiiiiiii,\n  K: invoke_viiiij,\n  u: invoke_viiiijjji,\n  X: invoke_viiij,\n  na: invoke_viijii,\n  qb: invoke_viijijj,\n  da: invoke_viijj,\n  G: invoke_vij,\n  Y: invoke_vj,\n  z: _llvm_eh_typeid_for,\n  a: wasmMemory,\n  wa: _proc_exit,\n  Aa: _random_get,\n  ya: _wgpuAdapterGetFeatures,\n  Ja: _wgpuAdapterGetInfo,\n  Sa: _wgpuAdapterGetLimits,\n  va: _wgpuAdapterHasFeature,\n  ra: _wgpuBufferGetSize,\n  ib: _wgpuCommandEncoderBeginComputePass,\n  bb: _wgpuCommandEncoderCopyBufferToBuffer,\n  db: _wgpuCommandEncoderFinish,\n  fb: _wgpuComputePassEncoderDispatchWorkgroups,\n  eb: _wgpuComputePassEncoderEnd,\n  gb: _wgpuComputePassEncoderSetBindGroup,\n  hb: _wgpuComputePassEncoderSetPipeline,\n  rb: _wgpuComputePipelineGetBindGroupLayout,\n  ob: _wgpuDeviceCreateBindGroup,\n  jb: _wgpuDeviceCreateCommandEncoder,\n  ua: _wgpuDeviceCreateComputePipeline,\n  cb: _wgpuQueueSubmit,\n  ba: _wgpuQueueWriteBuffer,\n};\nfunction invoke_v(index) {\n  var sp = stackSave();\n  try {\n    dynCall_v(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_iii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ii(index, a1) {\n  var sp = stackSave();\n  try {\n    return dynCall_ii(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    dynCall_vii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vi(index, a1) {\n  var sp = stackSave();\n  try {\n    dynCall_vi(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiii(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiii(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_jii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_jii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_viiii(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viiii(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vij(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    dynCall_vij(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iifff(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iifff(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiffiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiffiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iij(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_iij(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15,\n  a16,\n  a17\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15,\n      a16,\n      a17\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiif(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiif(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijj(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viijj(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijj(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijj(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijjjj(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijjjj(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiffffffi(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiffffffi(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiij(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiij(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ji(index, a1) {\n  var sp = stackSave();\n  try {\n    return dynCall_ji(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_i(index) {\n  var sp = stackSave();\n  try {\n    return dynCall_i(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ifi(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_ifi(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiff(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiff(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiijjji(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiijjji(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiifi(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiifi(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiijjiifiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15,\n  a16,\n  a17,\n  a18,\n  a19,\n  a20,\n  a21,\n  a22,\n  a23\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiijjiifiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15,\n      a16,\n      a17,\n      a18,\n      a19,\n      a20,\n      a21,\n      a22,\n      a23\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijjj(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijjj(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiifi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiifi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiff(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiff(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiji(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiji(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiijiiijjjjjjj(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiijiiijjjjjjj(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vj(index, a1) {\n  var sp = stackSave();\n  try {\n    dynCall_vj(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijijj(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    dynCall_viijijj(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viijii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiij(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiij(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiij(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viiij(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiid(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiid(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_j(index) {\n  var sp = stackSave();\n  try {\n    return dynCall_j(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_iiiij(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiij(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiij(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiij(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viif(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viif(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viid(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viid(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction applySignatureConversions(wasmExports) {\n  wasmExports = Object.assign({}, wasmExports);\n  var makeWrapper_pp = (f) => (a0) => f(a0) >>> 0;\n  var makeWrapper_ppp = (f) => (a0, a1) => f(a0, a1) >>> 0;\n  var makeWrapper_p = (f) => () => f() >>> 0;\n  wasmExports['Ab'] = makeWrapper_pp(wasmExports['Ab']);\n  wasmExports['dc'] = makeWrapper_ppp(wasmExports['dc']);\n  wasmExports['fc'] = makeWrapper_ppp(wasmExports['fc']);\n  wasmExports['jc'] = makeWrapper_pp(wasmExports['jc']);\n  wasmExports['kc'] = makeWrapper_p(wasmExports['kc']);\n  wasmExports['oc'] = makeWrapper_pp(wasmExports['oc']);\n  return wasmExports;\n}\nfunction callMain() {\n  var entryFunction = _main;\n  var argc = 0;\n  var argv = 0;\n  try {\n    var ret = entryFunction(argc, argv);\n    exitJS(ret, true);\n    return ret;\n  } catch (e) {\n    return handleException(e);\n  }\n}\nfunction run() {\n  if (runDependencies > 0) {\n    dependenciesFulfilled = run;\n    return;\n  }\n  preRun();\n  if (runDependencies > 0) {\n    dependenciesFulfilled = run;\n    return;\n  }\n  function doRun() {\n    Module['calledRun'] = true;\n    if (ABORT) return;\n    initRuntime();\n    preMain();\n    Module['onRuntimeInitialized']?.();\n    var noInitialRun = Module['noInitialRun'] || false;\n    if (!noInitialRun) callMain();\n    postRun();\n  }\n  if (Module['setStatus']) {\n    Module['setStatus']('Running...');\n    setTimeout(() => {\n      setTimeout(() => Module['setStatus'](''), 1);\n      doRun();\n    }, 1);\n  } else {\n    doRun();\n  }\n}\nvar wasmExports;\ncreateWasm();\nrun();\n";
var WLLAMA_ASYNCIFY_MULTI_THREAD_CODE = "var Module = typeof Module != 'undefined' ? Module : {};\nvar ENVIRONMENT_IS_WEB = !!globalThis.window;\nvar ENVIRONMENT_IS_WORKER = !!globalThis.WorkerGlobalScope;\nvar ENVIRONMENT_IS_NODE =\n  globalThis.process?.versions?.node && globalThis.process?.type != 'renderer';\nvar ENVIRONMENT_IS_PTHREAD =\n  ENVIRONMENT_IS_WORKER && self.name?.startsWith('em-pthread');\nif (ENVIRONMENT_IS_NODE) {\n  var worker_threads = require('worker_threads');\n  global.Worker = worker_threads.Worker;\n  ENVIRONMENT_IS_WORKER = !worker_threads.isMainThread;\n  ENVIRONMENT_IS_PTHREAD =\n    ENVIRONMENT_IS_WORKER && worker_threads['workerData'] == 'em-pthread';\n}\nvar arguments_ = [];\nvar thisProgram = './this.program';\nvar quit_ = (status, toThrow) => {\n  throw toThrow;\n};\nvar _scriptName = globalThis.document?.currentScript?.src;\nif (typeof __filename != 'undefined') {\n  _scriptName = __filename;\n} else if (ENVIRONMENT_IS_WORKER) {\n  _scriptName = self.location.href;\n}\nvar scriptDirectory = '';\nfunction locateFile(path) {\n  if (Module['locateFile']) {\n    return Module['locateFile'](path, scriptDirectory);\n  }\n  return scriptDirectory + path;\n}\nvar readAsync, readBinary;\nif (ENVIRONMENT_IS_NODE) {\n  var fs = require('fs');\n  scriptDirectory = __dirname + '/';\n  readBinary = (filename) => {\n    filename = isFileURI(filename) ? new URL(filename) : filename;\n    var ret = fs.readFileSync(filename);\n    return ret;\n  };\n  readAsync = async (filename, binary = true) => {\n    filename = isFileURI(filename) ? new URL(filename) : filename;\n    var ret = fs.readFileSync(filename, binary ? undefined : 'utf8');\n    return ret;\n  };\n  if (process.argv.length > 1) {\n    thisProgram = process.argv[1].replace(/\\\\/g, '/');\n  }\n  arguments_ = process.argv.slice(2);\n  if (typeof module != 'undefined') {\n    module['exports'] = Module;\n  }\n  quit_ = (status, toThrow) => {\n    process.exitCode = status;\n    throw toThrow;\n  };\n} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {\n  try {\n    scriptDirectory = new URL('.', _scriptName).href;\n  } catch {}\n  if (!ENVIRONMENT_IS_NODE) {\n    if (ENVIRONMENT_IS_WORKER) {\n      readBinary = (url) => {\n        var xhr = new XMLHttpRequest();\n        xhr.open('GET', url, false);\n        xhr.responseType = 'arraybuffer';\n        xhr.send(null);\n        return new Uint8Array(xhr.response);\n      };\n    }\n    readAsync = async (url) => {\n      if (isFileURI(url)) {\n        return new Promise((resolve, reject) => {\n          var xhr = new XMLHttpRequest();\n          xhr.open('GET', url, true);\n          xhr.responseType = 'arraybuffer';\n          xhr.onload = () => {\n            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {\n              resolve(xhr.response);\n              return;\n            }\n            reject(xhr.status);\n          };\n          xhr.onerror = reject;\n          xhr.send(null);\n        });\n      }\n      var response = await fetch(url, { credentials: 'same-origin' });\n      if (response.ok) {\n        return response.arrayBuffer();\n      }\n      throw new Error(response.status + ' : ' + response.url);\n    };\n  }\n} else {\n}\nvar defaultPrint = console.log.bind(console);\nvar defaultPrintErr = console.error.bind(console);\nif (ENVIRONMENT_IS_NODE) {\n  var utils = require('util');\n  var stringify = (a) => (typeof a == 'object' ? utils.inspect(a) : a);\n  defaultPrint = (...args) =>\n    fs.writeSync(1, args.map(stringify).join(' ') + '\\n');\n  defaultPrintErr = (...args) =>\n    fs.writeSync(2, args.map(stringify).join(' ') + '\\n');\n}\nvar out = defaultPrint;\nvar err = defaultPrintErr;\nvar wasmBinary;\nvar wasmModule;\nvar ABORT = false;\nvar EXITSTATUS;\nfunction assert(condition, text) {\n  if (!condition) {\n    abort(text);\n  }\n}\nvar isFileURI = (filename) => filename.startsWith('file://');\nfunction growMemViews() {\n  if (wasmMemory.buffer != HEAP8.buffer) {\n    updateMemoryViews();\n  }\n}\nif (ENVIRONMENT_IS_NODE && ENVIRONMENT_IS_PTHREAD) {\n  var parentPort = worker_threads['parentPort'];\n  parentPort.on('message', (msg) => global.onmessage?.({ data: msg }));\n  Object.assign(globalThis, {\n    self: global,\n    postMessage: (msg) => parentPort['postMessage'](msg),\n  });\n  process.on('uncaughtException', (err) => {\n    postMessage({ cmd: 'uncaughtException', error: err });\n    process.exit(1);\n  });\n}\nvar startWorker;\nif (ENVIRONMENT_IS_PTHREAD) {\n  var initializedJS = false;\n  self.onunhandledrejection = (e) => {\n    throw e.reason || e;\n  };\n  function handleMessage(e) {\n    try {\n      var msgData = e['data'];\n      var cmd = msgData.cmd;\n      if (cmd === 'load') {\n        let messageQueue = [];\n        self.onmessage = (e) => messageQueue.push(e);\n        startWorker = () => {\n          postMessage({ cmd: 'loaded' });\n          for (let msg of messageQueue) {\n            handleMessage(msg);\n          }\n          self.onmessage = handleMessage;\n        };\n        for (const handler of msgData.handlers) {\n          if (!Module[handler] || Module[handler].proxy) {\n            Module[handler] = (...args) => {\n              postMessage({ cmd: 'callHandler', handler, args });\n            };\n            if (handler == 'print') out = Module[handler];\n            if (handler == 'printErr') err = Module[handler];\n          }\n        }\n        wasmMemory = msgData.wasmMemory;\n        updateMemoryViews();\n        wasmModule = msgData.wasmModule;\n        createWasm();\n        run();\n      } else if (cmd === 'run') {\n        establishStackSpace(msgData.pthread_ptr);\n        __emscripten_thread_init(msgData.pthread_ptr, 0, 0, 1, 0, 0);\n        PThread.threadInitTLS();\n        __emscripten_thread_mailbox_await(msgData.pthread_ptr);\n        if (!initializedJS) {\n          initializedJS = true;\n        }\n        try {\n          invokeEntryPoint(msgData.start_routine, msgData.arg);\n        } catch (ex) {\n          if (ex != 'unwind') {\n            throw ex;\n          }\n        }\n      } else if (msgData.target === 'setimmediate') {\n      } else if (cmd === 'checkMailbox') {\n        if (initializedJS) {\n          checkMailbox();\n        }\n      } else if (cmd) {\n        err(`worker: received unknown command ${cmd}`);\n        err(msgData);\n      }\n    } catch (ex) {\n      __emscripten_thread_crashed();\n      throw ex;\n    }\n  }\n  self.onmessage = handleMessage;\n}\nvar HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;\nvar HEAP64, HEAPU64;\nvar runtimeInitialized = false;\nfunction updateMemoryViews() {\n  var b = wasmMemory.buffer;\n  HEAP8 = new Int8Array(b);\n  HEAP16 = new Int16Array(b);\n  Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);\n  HEAPU16 = new Uint16Array(b);\n  HEAP32 = new Int32Array(b);\n  HEAPU32 = new Uint32Array(b);\n  HEAPF32 = new Float32Array(b);\n  HEAPF64 = new Float64Array(b);\n  HEAP64 = new BigInt64Array(b);\n  HEAPU64 = new BigUint64Array(b);\n}\nfunction initMemory() {\n  if (ENVIRONMENT_IS_PTHREAD) {\n    return;\n  }\n  if (Module['wasmMemory']) {\n    wasmMemory = Module['wasmMemory'];\n  } else {\n    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 134217728;\n    wasmMemory = new WebAssembly.Memory({\n      initial: INITIAL_MEMORY / 65536,\n      maximum: 65536,\n      shared: true,\n    });\n  }\n  updateMemoryViews();\n}\nfunction preRun() {\n  if (Module['preRun']) {\n    if (typeof Module['preRun'] == 'function')\n      Module['preRun'] = [Module['preRun']];\n    while (Module['preRun'].length) {\n      addOnPreRun(Module['preRun'].shift());\n    }\n  }\n  callRuntimeCallbacks(onPreRuns);\n}\nfunction initRuntime() {\n  runtimeInitialized = true;\n  if (ENVIRONMENT_IS_PTHREAD) return startWorker();\n  if (!Module['noFSInit'] && !FS.initialized) FS.init();\n  TTY.init();\n  wasmExports['Ib']();\n  FS.ignorePermissions = false;\n}\nfunction preMain() {}\nfunction postRun() {\n  if (ENVIRONMENT_IS_PTHREAD) {\n    return;\n  }\n  if (Module['postRun']) {\n    if (typeof Module['postRun'] == 'function')\n      Module['postRun'] = [Module['postRun']];\n    while (Module['postRun'].length) {\n      addOnPostRun(Module['postRun'].shift());\n    }\n  }\n  callRuntimeCallbacks(onPostRuns);\n}\nfunction abort(what) {\n  Module['onAbort']?.(what);\n  what = 'Aborted(' + what + ')';\n  err(what);\n  ABORT = true;\n  what += '. Build with -sASSERTIONS for more info.';\n  var e = new WebAssembly.RuntimeError(what);\n  throw e;\n}\nvar wasmBinaryFile;\nfunction findWasmBinary() {\n  return locateFile('wllama.wasm');\n}\nfunction getBinarySync(file) {\n  if (file == wasmBinaryFile && wasmBinary) {\n    return new Uint8Array(wasmBinary);\n  }\n  if (readBinary) {\n    return readBinary(file);\n  }\n  throw 'both async and sync fetching of the wasm failed';\n}\nasync function getWasmBinary(binaryFile) {\n  if (!wasmBinary) {\n    try {\n      var response = await readAsync(binaryFile);\n      return new Uint8Array(response);\n    } catch {}\n  }\n  return getBinarySync(binaryFile);\n}\nasync function instantiateArrayBuffer(binaryFile, imports) {\n  try {\n    var binary = await getWasmBinary(binaryFile);\n    var instance = await WebAssembly.instantiate(binary, imports);\n    return instance;\n  } catch (reason) {\n    err(`failed to asynchronously prepare wasm: ${reason}`);\n    abort(reason);\n  }\n}\nasync function instantiateAsync(binary, binaryFile, imports) {\n  if (!binary && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {\n    try {\n      var response = fetch(binaryFile, { credentials: 'same-origin' });\n      var instantiationResult = await WebAssembly.instantiateStreaming(\n        response,\n        imports\n      );\n      return instantiationResult;\n    } catch (reason) {\n      err(`wasm streaming compile failed: ${reason}`);\n      err('falling back to ArrayBuffer instantiation');\n    }\n  }\n  return instantiateArrayBuffer(binaryFile, imports);\n}\nfunction getWasmImports() {\n  assignWasmImports();\n  var imports = { a: wasmImports };\n  return imports;\n}\nasync function createWasm() {\n  function receiveInstance(instance, module) {\n    wasmExports = instance.exports;\n    wasmExports = Asyncify.instrumentWasmExports(wasmExports);\n    wasmExports = applySignatureConversions(wasmExports);\n    registerTLSInit(wasmExports['rc']);\n    assignWasmExports(wasmExports);\n    wasmModule = module;\n    removeRunDependency('wasm-instantiate');\n    return wasmExports;\n  }\n  addRunDependency('wasm-instantiate');\n  function receiveInstantiationResult(result) {\n    return receiveInstance(result['instance'], result['module']);\n  }\n  var info = getWasmImports();\n  if (Module['instantiateWasm']) {\n    return new Promise((resolve, reject) => {\n      Module['instantiateWasm'](info, (inst, mod) => {\n        resolve(receiveInstance(inst, mod));\n      });\n    });\n  }\n  if (ENVIRONMENT_IS_PTHREAD) {\n    var instance = new WebAssembly.Instance(wasmModule, getWasmImports());\n    return receiveInstance(instance, wasmModule);\n  }\n  wasmBinaryFile ??= findWasmBinary();\n  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);\n  var exports = receiveInstantiationResult(result);\n  return exports;\n}\nclass ExitStatus {\n  name = 'ExitStatus';\n  constructor(status) {\n    this.message = `Program terminated with exit(${status})`;\n    this.status = status;\n  }\n}\nvar terminateWorker = (worker) => {\n  worker.terminate();\n  worker.onmessage = (e) => {};\n};\nvar cleanupThread = (pthread_ptr) => {\n  var worker = PThread.pthreads[pthread_ptr];\n  PThread.returnWorkerToPool(worker);\n};\nvar callRuntimeCallbacks = (callbacks) => {\n  while (callbacks.length > 0) {\n    callbacks.shift()(Module);\n  }\n};\nvar onPreRuns = [];\nvar addOnPreRun = (cb) => onPreRuns.push(cb);\nvar runDependencies = 0;\nvar dependenciesFulfilled = null;\nvar removeRunDependency = (id) => {\n  runDependencies--;\n  Module['monitorRunDependencies']?.(runDependencies);\n  if (runDependencies == 0) {\n    if (dependenciesFulfilled) {\n      var callback = dependenciesFulfilled;\n      dependenciesFulfilled = null;\n      callback();\n    }\n  }\n};\nvar addRunDependency = (id) => {\n  runDependencies++;\n  Module['monitorRunDependencies']?.(runDependencies);\n};\nvar spawnThread = (threadParams) => {\n  var worker = PThread.getNewWorker();\n  if (!worker) {\n    return 6;\n  }\n  PThread.runningWorkers.push(worker);\n  PThread.pthreads[threadParams.pthread_ptr] = worker;\n  worker.pthread_ptr = threadParams.pthread_ptr;\n  var msg = {\n    cmd: 'run',\n    start_routine: threadParams.startRoutine,\n    arg: threadParams.arg,\n    pthread_ptr: threadParams.pthread_ptr,\n  };\n  if (ENVIRONMENT_IS_NODE) {\n    worker.unref();\n  }\n  worker.postMessage(msg, threadParams.transferList);\n  return 0;\n};\nvar runtimeKeepaliveCounter = 0;\nvar keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;\nvar stackSave = () => _emscripten_stack_get_current();\nvar stackRestore = (val) => __emscripten_stack_restore(val);\nvar stackAlloc = (sz) => __emscripten_stack_alloc(sz);\nvar proxyToMainThread = (funcIndex, emAsmAddr, sync, ...callArgs) => {\n  var serializedNumCallArgs = callArgs.length * 2;\n  var sp = stackSave();\n  var args = stackAlloc(serializedNumCallArgs * 8);\n  var b = args >>> 3;\n  for (var i = 0; i < callArgs.length; i++) {\n    var arg = callArgs[i];\n    if (typeof arg == 'bigint') {\n      (growMemViews(), HEAP64)[(b + 2 * i) >>> 0] = 1n;\n      (growMemViews(), HEAP64)[(b + 2 * i + 1) >>> 0] = arg;\n    } else {\n      (growMemViews(), HEAP64)[(b + 2 * i) >>> 0] = 0n;\n      (growMemViews(), HEAPF64)[(b + 2 * i + 1) >>> 0] = arg;\n    }\n  }\n  var rtn = __emscripten_run_js_on_main_thread(\n    funcIndex,\n    emAsmAddr,\n    serializedNumCallArgs,\n    args,\n    sync\n  );\n  stackRestore(sp);\n  return rtn;\n};\nfunction _proc_exit(code) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(0, 0, 1, code);\n  EXITSTATUS = code;\n  if (!keepRuntimeAlive()) {\n    PThread.terminateAllThreads();\n    Module['onExit']?.(code);\n    ABORT = true;\n  }\n  quit_(code, new ExitStatus(code));\n}\nfunction exitOnMainThread(returnCode) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(1, 0, 0, returnCode);\n  _exit(returnCode);\n}\nvar exitJS = (status, implicit) => {\n  EXITSTATUS = status;\n  if (ENVIRONMENT_IS_PTHREAD) {\n    exitOnMainThread(status);\n    throw 'unwind';\n  }\n  _proc_exit(status);\n};\nvar _exit = exitJS;\nvar PThread = {\n  unusedWorkers: [],\n  runningWorkers: [],\n  tlsInitFunctions: [],\n  pthreads: {},\n  init() {\n    if (!ENVIRONMENT_IS_PTHREAD) {\n      PThread.initMainThread();\n    }\n  },\n  initMainThread() {\n    var pthreadPoolSize = Module['pthreadPoolSize'];\n    while (pthreadPoolSize--) {\n      PThread.allocateUnusedWorker();\n    }\n    addOnPreRun(async () => {\n      var pthreadPoolReady = PThread.loadWasmModuleToAllWorkers();\n      addRunDependency('loading-workers');\n      await pthreadPoolReady;\n      removeRunDependency('loading-workers');\n    });\n  },\n  terminateAllThreads: () => {\n    for (var worker of PThread.runningWorkers) {\n      terminateWorker(worker);\n    }\n    for (var worker of PThread.unusedWorkers) {\n      terminateWorker(worker);\n    }\n    PThread.unusedWorkers = [];\n    PThread.runningWorkers = [];\n    PThread.pthreads = {};\n  },\n  returnWorkerToPool: (worker) => {\n    var pthread_ptr = worker.pthread_ptr;\n    delete PThread.pthreads[pthread_ptr];\n    PThread.unusedWorkers.push(worker);\n    PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker), 1);\n    worker.pthread_ptr = 0;\n    __emscripten_thread_free_data(pthread_ptr);\n  },\n  threadInitTLS() {\n    PThread.tlsInitFunctions.forEach((f) => f());\n  },\n  loadWasmModuleToWorker: (worker) =>\n    new Promise((onFinishedLoading) => {\n      worker.onmessage = (e) => {\n        var d = e['data'];\n        var cmd = d.cmd;\n        if (d.targetThread && d.targetThread != _pthread_self()) {\n          var targetWorker = PThread.pthreads[d.targetThread];\n          if (targetWorker) {\n            targetWorker.postMessage(d, d.transferList);\n          } else {\n            err(\n              `Internal error! Worker sent a message \"${cmd}\" to target pthread ${d.targetThread}, but that thread no longer exists!`\n            );\n          }\n          return;\n        }\n        if (cmd === 'checkMailbox') {\n          checkMailbox();\n        } else if (cmd === 'spawnThread') {\n          spawnThread(d);\n        } else if (cmd === 'cleanupThread') {\n          callUserCallback(() => cleanupThread(d.thread));\n        } else if (cmd === 'loaded') {\n          worker.loaded = true;\n          if (ENVIRONMENT_IS_NODE && !worker.pthread_ptr) {\n            worker.unref();\n          }\n          onFinishedLoading(worker);\n        } else if (d.target === 'setimmediate') {\n          worker.postMessage(d);\n        } else if (cmd === 'uncaughtException') {\n          worker.onerror(d.error);\n        } else if (cmd === 'callHandler') {\n          Module[d.handler](...d.args);\n        } else if (cmd) {\n          err(`worker sent an unknown command ${cmd}`);\n        }\n      };\n      worker.onerror = (e) => {\n        var message = 'worker sent an error!';\n        err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);\n        throw e;\n      };\n      if (ENVIRONMENT_IS_NODE) {\n        worker.on('message', (data) => worker.onmessage({ data }));\n        worker.on('error', (e) => worker.onerror(e));\n      }\n      var handlers = [];\n      var knownHandlers = ['onExit', 'onAbort', 'print', 'printErr'];\n      for (var handler of knownHandlers) {\n        if (Module.propertyIsEnumerable(handler)) {\n          handlers.push(handler);\n        }\n      }\n      worker.postMessage({ cmd: 'load', handlers, wasmMemory, wasmModule });\n    }),\n  async loadWasmModuleToAllWorkers() {\n    if (ENVIRONMENT_IS_PTHREAD) {\n      return;\n    }\n    let pthreadPoolReady = Promise.all(\n      PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker)\n    );\n    return pthreadPoolReady;\n  },\n  allocateUnusedWorker() {\n    var worker;\n    var pthreadMainJs = _scriptName;\n    if (Module['mainScriptUrlOrBlob']) {\n      pthreadMainJs = Module['mainScriptUrlOrBlob'];\n      if (typeof pthreadMainJs != 'string') {\n        pthreadMainJs = URL.createObjectURL(pthreadMainJs);\n      }\n    }\n    worker = new Worker(pthreadMainJs, {\n      workerData: 'em-pthread',\n      name: 'em-pthread',\n    });\n    PThread.unusedWorkers.push(worker);\n  },\n  getNewWorker() {\n    if (PThread.unusedWorkers.length == 0) {\n      PThread.allocateUnusedWorker();\n      PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0]);\n    }\n    return PThread.unusedWorkers.pop();\n  },\n};\nvar onPostRuns = [];\nvar addOnPostRun = (cb) => onPostRuns.push(cb);\nvar dynCalls = {};\nfunction establishStackSpace(pthread_ptr) {\n  var stackHigh = (growMemViews(), HEAPU32)[((pthread_ptr + 52) >>> 2) >>> 0];\n  var stackSize = (growMemViews(), HEAPU32)[((pthread_ptr + 56) >>> 2) >>> 0];\n  var stackLow = stackHigh - stackSize;\n  _emscripten_stack_set_limits(stackHigh, stackLow);\n  stackRestore(stackHigh);\n}\nvar invokeEntryPoint = (ptr, arg) => {\n  runtimeKeepaliveCounter = 0;\n  noExitRuntime = 0;\n  var result = ((a1) => dynCall_ii(ptr, a1))(arg);\n  function finish(result) {\n    if (keepRuntimeAlive()) {\n      EXITSTATUS = result;\n      return;\n    }\n    __emscripten_thread_exit(result);\n  }\n  finish(result);\n};\ninvokeEntryPoint.isAsync = true;\nvar noExitRuntime = true;\nvar registerTLSInit = (tlsInitFunc) =>\n  PThread.tlsInitFunctions.push(tlsInitFunc);\nvar wasmMemory;\nvar INT53_MAX = 9007199254740992;\nvar INT53_MIN = -9007199254740992;\nvar bigintToI53Checked = (num) =>\n  num < INT53_MIN || num > INT53_MAX ? NaN : Number(num);\nvar UTF8Decoder = globalThis.TextDecoder && new TextDecoder();\nvar findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {\n  var maxIdx = idx + maxBytesToRead;\n  if (ignoreNul) return maxIdx;\n  while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;\n  return idx;\n};\nvar UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {\n  idx >>>= 0;\n  var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);\n  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {\n    return UTF8Decoder.decode(\n      heapOrArray.buffer instanceof ArrayBuffer\n        ? heapOrArray.subarray(idx, endPtr)\n        : heapOrArray.slice(idx, endPtr)\n    );\n  }\n  var str = '';\n  while (idx < endPtr) {\n    var u0 = heapOrArray[idx++];\n    if (!(u0 & 128)) {\n      str += String.fromCharCode(u0);\n      continue;\n    }\n    var u1 = heapOrArray[idx++] & 63;\n    if ((u0 & 224) == 192) {\n      str += String.fromCharCode(((u0 & 31) << 6) | u1);\n      continue;\n    }\n    var u2 = heapOrArray[idx++] & 63;\n    if ((u0 & 240) == 224) {\n      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;\n    } else {\n      u0 =\n        ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);\n    }\n    if (u0 < 65536) {\n      str += String.fromCharCode(u0);\n    } else {\n      var ch = u0 - 65536;\n      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));\n    }\n  }\n  return str;\n};\nvar UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {\n  ptr >>>= 0;\n  return ptr\n    ? UTF8ArrayToString(\n        (growMemViews(), HEAPU8),\n        ptr,\n        maxBytesToRead,\n        ignoreNul\n      )\n    : '';\n};\nvar exceptionCaught = [];\nvar uncaughtExceptionCount = 0;\nfunction ___cxa_begin_catch(ptr) {\n  ptr >>>= 0;\n  var info = new ExceptionInfo(ptr);\n  if (!info.get_caught()) {\n    info.set_caught(true);\n    uncaughtExceptionCount--;\n  }\n  info.set_rethrown(false);\n  exceptionCaught.push(info);\n  ___cxa_increment_exception_refcount(ptr);\n  return ___cxa_get_exception_ptr(ptr);\n}\nfunction ___cxa_current_primary_exception() {\n  if (!exceptionCaught.length) {\n    return 0;\n  }\n  var info = exceptionCaught[exceptionCaught.length - 1];\n  ___cxa_increment_exception_refcount(info.excPtr);\n  return info.excPtr;\n}\nvar exceptionLast = 0;\nvar ___cxa_end_catch = () => {\n  _setThrew(0, 0);\n  var info = exceptionCaught.pop();\n  ___cxa_decrement_exception_refcount(info.excPtr);\n  exceptionLast = 0;\n};\nclass ExceptionInfo {\n  constructor(excPtr) {\n    this.excPtr = excPtr;\n    this.ptr = excPtr - 24;\n  }\n  set_type(type) {\n    (growMemViews(), HEAPU32)[((this.ptr + 4) >>> 2) >>> 0] = type;\n  }\n  get_type() {\n    return (growMemViews(), HEAPU32)[((this.ptr + 4) >>> 2) >>> 0];\n  }\n  set_destructor(destructor) {\n    (growMemViews(), HEAPU32)[((this.ptr + 8) >>> 2) >>> 0] = destructor;\n  }\n  get_destructor() {\n    return (growMemViews(), HEAPU32)[((this.ptr + 8) >>> 2) >>> 0];\n  }\n  set_caught(caught) {\n    caught = caught ? 1 : 0;\n    (growMemViews(), HEAP8)[(this.ptr + 12) >>> 0] = caught;\n  }\n  get_caught() {\n    return (growMemViews(), HEAP8)[(this.ptr + 12) >>> 0] != 0;\n  }\n  set_rethrown(rethrown) {\n    rethrown = rethrown ? 1 : 0;\n    (growMemViews(), HEAP8)[(this.ptr + 13) >>> 0] = rethrown;\n  }\n  get_rethrown() {\n    return (growMemViews(), HEAP8)[(this.ptr + 13) >>> 0] != 0;\n  }\n  init(type, destructor) {\n    this.set_adjusted_ptr(0);\n    this.set_type(type);\n    this.set_destructor(destructor);\n  }\n  set_adjusted_ptr(adjustedPtr) {\n    (growMemViews(), HEAPU32)[((this.ptr + 16) >>> 2) >>> 0] = adjustedPtr;\n  }\n  get_adjusted_ptr() {\n    return (growMemViews(), HEAPU32)[((this.ptr + 16) >>> 2) >>> 0];\n  }\n}\nvar setTempRet0 = (val) => __emscripten_tempret_set(val);\nvar findMatchingCatch = (args) => {\n  var thrown = exceptionLast;\n  if (!thrown) {\n    setTempRet0(0);\n    return 0;\n  }\n  var info = new ExceptionInfo(thrown);\n  info.set_adjusted_ptr(thrown);\n  var thrownType = info.get_type();\n  if (!thrownType) {\n    setTempRet0(0);\n    return thrown;\n  }\n  for (var caughtType of args) {\n    if (caughtType === 0 || caughtType === thrownType) {\n      break;\n    }\n    var adjusted_ptr_addr = info.ptr + 16;\n    if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {\n      setTempRet0(caughtType);\n      return thrown;\n    }\n  }\n  setTempRet0(thrownType);\n  return thrown;\n};\nfunction ___cxa_find_matching_catch_2() {\n  return findMatchingCatch([]);\n}\nfunction ___cxa_find_matching_catch_3(arg0) {\n  arg0 >>>= 0;\n  return findMatchingCatch([arg0]);\n}\nfunction ___cxa_find_matching_catch_4(arg0, arg1) {\n  arg0 >>>= 0;\n  arg1 >>>= 0;\n  return findMatchingCatch([arg0, arg1]);\n}\nvar ___cxa_rethrow = () => {\n  var info = exceptionCaught.pop();\n  if (!info) {\n    abort('no exception to throw');\n  }\n  var ptr = info.excPtr;\n  if (!info.get_rethrown()) {\n    exceptionCaught.push(info);\n    info.set_rethrown(true);\n    info.set_caught(false);\n    uncaughtExceptionCount++;\n  }\n  exceptionLast = ptr;\n  throw exceptionLast;\n};\nfunction ___cxa_rethrow_primary_exception(ptr) {\n  ptr >>>= 0;\n  if (!ptr) return;\n  var info = new ExceptionInfo(ptr);\n  exceptionCaught.push(info);\n  info.set_rethrown(true);\n  ___cxa_rethrow();\n}\nfunction ___cxa_throw(ptr, type, destructor) {\n  ptr >>>= 0;\n  type >>>= 0;\n  destructor >>>= 0;\n  var info = new ExceptionInfo(ptr);\n  info.init(type, destructor);\n  exceptionLast = ptr;\n  uncaughtExceptionCount++;\n  throw exceptionLast;\n}\nvar ___cxa_uncaught_exceptions = () => uncaughtExceptionCount;\nfunction pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(2, 0, 1, pthread_ptr, attr, startRoutine, arg);\n  return ___pthread_create_js(pthread_ptr, attr, startRoutine, arg);\n}\nvar _emscripten_has_threading_support = () => !!globalThis.SharedArrayBuffer;\nfunction ___pthread_create_js(pthread_ptr, attr, startRoutine, arg) {\n  pthread_ptr >>>= 0;\n  attr >>>= 0;\n  startRoutine >>>= 0;\n  arg >>>= 0;\n  if (!_emscripten_has_threading_support()) {\n    return 6;\n  }\n  var transferList = [];\n  var error = 0;\n  if (ENVIRONMENT_IS_PTHREAD && (transferList.length === 0 || error)) {\n    return pthreadCreateProxied(pthread_ptr, attr, startRoutine, arg);\n  }\n  if (error) return error;\n  var threadParams = { startRoutine, pthread_ptr, arg, transferList };\n  if (ENVIRONMENT_IS_PTHREAD) {\n    threadParams.cmd = 'spawnThread';\n    postMessage(threadParams, transferList);\n    return 0;\n  }\n  return spawnThread(threadParams);\n}\nfunction ___resumeException(ptr) {\n  ptr >>>= 0;\n  if (!exceptionLast) {\n    exceptionLast = ptr;\n  }\n  throw exceptionLast;\n}\nvar syscallGetVarargI = () => {\n  var ret = (growMemViews(), HEAP32)[(+SYSCALLS.varargs >>> 2) >>> 0];\n  SYSCALLS.varargs += 4;\n  return ret;\n};\nvar syscallGetVarargP = syscallGetVarargI;\nvar PATH = {\n  isAbs: (path) => path.charAt(0) === '/',\n  splitPath: (filename) => {\n    var splitPathRe =\n      /^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;\n    return splitPathRe.exec(filename).slice(1);\n  },\n  normalizeArray: (parts, allowAboveRoot) => {\n    var up = 0;\n    for (var i = parts.length - 1; i >= 0; i--) {\n      var last = parts[i];\n      if (last === '.') {\n        parts.splice(i, 1);\n      } else if (last === '..') {\n        parts.splice(i, 1);\n        up++;\n      } else if (up) {\n        parts.splice(i, 1);\n        up--;\n      }\n    }\n    if (allowAboveRoot) {\n      for (; up; up--) {\n        parts.unshift('..');\n      }\n    }\n    return parts;\n  },\n  normalize: (path) => {\n    var isAbsolute = PATH.isAbs(path),\n      trailingSlash = path.slice(-1) === '/';\n    path = PATH.normalizeArray(\n      path.split('/').filter((p) => !!p),\n      !isAbsolute\n    ).join('/');\n    if (!path && !isAbsolute) {\n      path = '.';\n    }\n    if (path && trailingSlash) {\n      path += '/';\n    }\n    return (isAbsolute ? '/' : '') + path;\n  },\n  dirname: (path) => {\n    var result = PATH.splitPath(path),\n      root = result[0],\n      dir = result[1];\n    if (!root && !dir) {\n      return '.';\n    }\n    if (dir) {\n      dir = dir.slice(0, -1);\n    }\n    return root + dir;\n  },\n  basename: (path) => path && path.match(/([^\\/]+|\\/)\\/*$/)[1],\n  join: (...paths) => PATH.normalize(paths.join('/')),\n  join2: (l, r) => PATH.normalize(l + '/' + r),\n};\nvar initRandomFill = () => {\n  if (ENVIRONMENT_IS_NODE) {\n    var nodeCrypto = require('crypto');\n    return (view) => nodeCrypto.randomFillSync(view);\n  }\n  return (view) =>\n    view.set(crypto.getRandomValues(new Uint8Array(view.byteLength)));\n};\nvar randomFill = (view) => {\n  (randomFill = initRandomFill())(view);\n};\nvar PATH_FS = {\n  resolve: (...args) => {\n    var resolvedPath = '',\n      resolvedAbsolute = false;\n    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {\n      var path = i >= 0 ? args[i] : FS.cwd();\n      if (typeof path != 'string') {\n        throw new TypeError('Arguments to path.resolve must be strings');\n      } else if (!path) {\n        return '';\n      }\n      resolvedPath = path + '/' + resolvedPath;\n      resolvedAbsolute = PATH.isAbs(path);\n    }\n    resolvedPath = PATH.normalizeArray(\n      resolvedPath.split('/').filter((p) => !!p),\n      !resolvedAbsolute\n    ).join('/');\n    return (resolvedAbsolute ? '/' : '') + resolvedPath || '.';\n  },\n  relative: (from, to) => {\n    from = PATH_FS.resolve(from).slice(1);\n    to = PATH_FS.resolve(to).slice(1);\n    function trim(arr) {\n      var start = 0;\n      for (; start < arr.length; start++) {\n        if (arr[start] !== '') break;\n      }\n      var end = arr.length - 1;\n      for (; end >= 0; end--) {\n        if (arr[end] !== '') break;\n      }\n      if (start > end) return [];\n      return arr.slice(start, end - start + 1);\n    }\n    var fromParts = trim(from.split('/'));\n    var toParts = trim(to.split('/'));\n    var length = Math.min(fromParts.length, toParts.length);\n    var samePartsLength = length;\n    for (var i = 0; i < length; i++) {\n      if (fromParts[i] !== toParts[i]) {\n        samePartsLength = i;\n        break;\n      }\n    }\n    var outputParts = [];\n    for (var i = samePartsLength; i < fromParts.length; i++) {\n      outputParts.push('..');\n    }\n    outputParts = outputParts.concat(toParts.slice(samePartsLength));\n    return outputParts.join('/');\n  },\n};\nvar FS_stdin_getChar_buffer = [];\nvar lengthBytesUTF8 = (str) => {\n  var len = 0;\n  for (var i = 0; i < str.length; ++i) {\n    var c = str.charCodeAt(i);\n    if (c <= 127) {\n      len++;\n    } else if (c <= 2047) {\n      len += 2;\n    } else if (c >= 55296 && c <= 57343) {\n      len += 4;\n      ++i;\n    } else {\n      len += 3;\n    }\n  }\n  return len;\n};\nvar stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {\n  outIdx >>>= 0;\n  if (!(maxBytesToWrite > 0)) return 0;\n  var startIdx = outIdx;\n  var endIdx = outIdx + maxBytesToWrite - 1;\n  for (var i = 0; i < str.length; ++i) {\n    var u = str.codePointAt(i);\n    if (u <= 127) {\n      if (outIdx >= endIdx) break;\n      heap[outIdx++ >>> 0] = u;\n    } else if (u <= 2047) {\n      if (outIdx + 1 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 192 | (u >> 6);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n    } else if (u <= 65535) {\n      if (outIdx + 2 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 224 | (u >> 12);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n    } else {\n      if (outIdx + 3 >= endIdx) break;\n      heap[outIdx++ >>> 0] = 240 | (u >> 18);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 12) & 63);\n      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);\n      heap[outIdx++ >>> 0] = 128 | (u & 63);\n      i++;\n    }\n  }\n  heap[outIdx >>> 0] = 0;\n  return outIdx - startIdx;\n};\nvar intArrayFromString = (stringy, dontAddNull, length) => {\n  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;\n  var u8array = new Array(len);\n  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);\n  if (dontAddNull) u8array.length = numBytesWritten;\n  return u8array;\n};\nvar FS_stdin_getChar = () => {\n  if (!FS_stdin_getChar_buffer.length) {\n    var result = null;\n    if (ENVIRONMENT_IS_NODE) {\n      var BUFSIZE = 256;\n      var buf = Buffer.alloc(BUFSIZE);\n      var bytesRead = 0;\n      var fd = process.stdin.fd;\n      try {\n        bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);\n      } catch (e) {\n        if (e.toString().includes('EOF')) bytesRead = 0;\n        else throw e;\n      }\n      if (bytesRead > 0) {\n        result = buf.slice(0, bytesRead).toString('utf-8');\n      }\n    } else if (globalThis.window?.prompt) {\n      result = window.prompt('Input: ');\n      if (result !== null) {\n        result += '\\n';\n      }\n    } else {\n    }\n    if (!result) {\n      return null;\n    }\n    FS_stdin_getChar_buffer = intArrayFromString(result, true);\n  }\n  return FS_stdin_getChar_buffer.shift();\n};\nvar TTY = {\n  ttys: [],\n  init() {},\n  shutdown() {},\n  register(dev, ops) {\n    TTY.ttys[dev] = { input: [], output: [], ops };\n    FS.registerDevice(dev, TTY.stream_ops);\n  },\n  stream_ops: {\n    open(stream) {\n      var tty = TTY.ttys[stream.node.rdev];\n      if (!tty) {\n        throw new FS.ErrnoError(43);\n      }\n      stream.tty = tty;\n      stream.seekable = false;\n    },\n    close(stream) {\n      stream.tty.ops.fsync(stream.tty);\n    },\n    fsync(stream) {\n      stream.tty.ops.fsync(stream.tty);\n    },\n    read(stream, buffer, offset, length, pos) {\n      if (!stream.tty || !stream.tty.ops.get_char) {\n        throw new FS.ErrnoError(60);\n      }\n      var bytesRead = 0;\n      for (var i = 0; i < length; i++) {\n        var result;\n        try {\n          result = stream.tty.ops.get_char(stream.tty);\n        } catch (e) {\n          throw new FS.ErrnoError(29);\n        }\n        if (result === undefined && bytesRead === 0) {\n          throw new FS.ErrnoError(6);\n        }\n        if (result === null || result === undefined) break;\n        bytesRead++;\n        buffer[offset + i] = result;\n      }\n      if (bytesRead) {\n        stream.node.atime = Date.now();\n      }\n      return bytesRead;\n    },\n    write(stream, buffer, offset, length, pos) {\n      if (!stream.tty || !stream.tty.ops.put_char) {\n        throw new FS.ErrnoError(60);\n      }\n      try {\n        for (var i = 0; i < length; i++) {\n          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);\n        }\n      } catch (e) {\n        throw new FS.ErrnoError(29);\n      }\n      if (length) {\n        stream.node.mtime = stream.node.ctime = Date.now();\n      }\n      return i;\n    },\n  },\n  default_tty_ops: {\n    get_char(tty) {\n      return FS_stdin_getChar();\n    },\n    put_char(tty, val) {\n      if (val === null || val === 10) {\n        out(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      } else {\n        if (val != 0) tty.output.push(val);\n      }\n    },\n    fsync(tty) {\n      if (tty.output?.length > 0) {\n        out(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      }\n    },\n    ioctl_tcgets(tty) {\n      return {\n        c_iflag: 25856,\n        c_oflag: 5,\n        c_cflag: 191,\n        c_lflag: 35387,\n        c_cc: [\n          3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0,\n          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,\n        ],\n      };\n    },\n    ioctl_tcsets(tty, optional_actions, data) {\n      return 0;\n    },\n    ioctl_tiocgwinsz(tty) {\n      return [24, 80];\n    },\n  },\n  default_tty1_ops: {\n    put_char(tty, val) {\n      if (val === null || val === 10) {\n        err(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      } else {\n        if (val != 0) tty.output.push(val);\n      }\n    },\n    fsync(tty) {\n      if (tty.output?.length > 0) {\n        err(UTF8ArrayToString(tty.output));\n        tty.output = [];\n      }\n    },\n  },\n};\nvar zeroMemory = (ptr, size) =>\n  (growMemViews(), HEAPU8).fill(0, ptr, ptr + size);\nvar alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;\nvar mmapAlloc = (size) => {\n  size = alignMemory(size, 65536);\n  var ptr = _emscripten_builtin_memalign(65536, size);\n  if (ptr) zeroMemory(ptr, size);\n  return ptr;\n};\nvar MEMFS = {\n  ops_table: null,\n  mount(mount) {\n    return MEMFS.createNode(null, '/', 16895, 0);\n  },\n  createNode(parent, name, mode, dev) {\n    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {\n      throw new FS.ErrnoError(63);\n    }\n    MEMFS.ops_table ||= {\n      dir: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n          lookup: MEMFS.node_ops.lookup,\n          mknod: MEMFS.node_ops.mknod,\n          rename: MEMFS.node_ops.rename,\n          unlink: MEMFS.node_ops.unlink,\n          rmdir: MEMFS.node_ops.rmdir,\n          readdir: MEMFS.node_ops.readdir,\n          symlink: MEMFS.node_ops.symlink,\n        },\n        stream: { llseek: MEMFS.stream_ops.llseek },\n      },\n      file: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n        },\n        stream: {\n          llseek: MEMFS.stream_ops.llseek,\n          read: MEMFS.stream_ops.read,\n          write: MEMFS.stream_ops.write,\n          mmap: MEMFS.stream_ops.mmap,\n          msync: MEMFS.stream_ops.msync,\n        },\n      },\n      link: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n          readlink: MEMFS.node_ops.readlink,\n        },\n        stream: {},\n      },\n      chrdev: {\n        node: {\n          getattr: MEMFS.node_ops.getattr,\n          setattr: MEMFS.node_ops.setattr,\n        },\n        stream: FS.chrdev_stream_ops,\n      },\n    };\n    var node = FS.createNode(parent, name, mode, dev);\n    if (FS.isDir(node.mode)) {\n      node.node_ops = MEMFS.ops_table.dir.node;\n      node.stream_ops = MEMFS.ops_table.dir.stream;\n      node.contents = {};\n    } else if (FS.isFile(node.mode)) {\n      node.node_ops = MEMFS.ops_table.file.node;\n      node.stream_ops = MEMFS.ops_table.file.stream;\n      node.usedBytes = 0;\n      node.contents = null;\n    } else if (FS.isLink(node.mode)) {\n      node.node_ops = MEMFS.ops_table.link.node;\n      node.stream_ops = MEMFS.ops_table.link.stream;\n    } else if (FS.isChrdev(node.mode)) {\n      node.node_ops = MEMFS.ops_table.chrdev.node;\n      node.stream_ops = MEMFS.ops_table.chrdev.stream;\n    }\n    node.atime = node.mtime = node.ctime = Date.now();\n    if (parent) {\n      parent.contents[name] = node;\n      parent.atime = parent.mtime = parent.ctime = node.atime;\n    }\n    return node;\n  },\n  getFileDataAsTypedArray(node) {\n    if (!node.contents) return new Uint8Array(0);\n    if (node.contents.subarray)\n      return node.contents.subarray(0, node.usedBytes);\n    return new Uint8Array(node.contents);\n  },\n  expandFileStorage(node, newCapacity) {\n    var prevCapacity = node.contents ? node.contents.length : 0;\n    if (prevCapacity >= newCapacity) return;\n    var CAPACITY_DOUBLING_MAX = 1024 * 1024;\n    newCapacity = Math.max(\n      newCapacity,\n      (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>> 0\n    );\n    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);\n    var oldContents = node.contents;\n    node.contents = new Uint8Array(newCapacity);\n    if (node.usedBytes > 0)\n      node.contents.set(oldContents.subarray(0, node.usedBytes), 0);\n  },\n  resizeFileStorage(node, newSize) {\n    if (node.usedBytes == newSize) return;\n    if (newSize == 0) {\n      node.contents = null;\n      node.usedBytes = 0;\n    } else {\n      var oldContents = node.contents;\n      node.contents = new Uint8Array(newSize);\n      if (oldContents) {\n        node.contents.set(\n          oldContents.subarray(0, Math.min(newSize, node.usedBytes))\n        );\n      }\n      node.usedBytes = newSize;\n    }\n  },\n  node_ops: {\n    getattr(node) {\n      var attr = {};\n      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;\n      attr.ino = node.id;\n      attr.mode = node.mode;\n      attr.nlink = 1;\n      attr.uid = 0;\n      attr.gid = 0;\n      attr.rdev = node.rdev;\n      if (FS.isDir(node.mode)) {\n        attr.size = 4096;\n      } else if (FS.isFile(node.mode)) {\n        attr.size = node.usedBytes;\n      } else if (FS.isLink(node.mode)) {\n        attr.size = node.link.length;\n      } else {\n        attr.size = 0;\n      }\n      attr.atime = new Date(node.atime);\n      attr.mtime = new Date(node.mtime);\n      attr.ctime = new Date(node.ctime);\n      attr.blksize = 4096;\n      attr.blocks = Math.ceil(attr.size / attr.blksize);\n      return attr;\n    },\n    setattr(node, attr) {\n      for (const key of ['mode', 'atime', 'mtime', 'ctime']) {\n        if (attr[key] != null) {\n          node[key] = attr[key];\n        }\n      }\n      if (attr.size !== undefined) {\n        MEMFS.resizeFileStorage(node, attr.size);\n      }\n    },\n    lookup(parent, name) {\n      if (!MEMFS.doesNotExistError) {\n        MEMFS.doesNotExistError = new FS.ErrnoError(44);\n        MEMFS.doesNotExistError.stack = '<generic error, no stack>';\n      }\n      throw MEMFS.doesNotExistError;\n    },\n    mknod(parent, name, mode, dev) {\n      return MEMFS.createNode(parent, name, mode, dev);\n    },\n    rename(old_node, new_dir, new_name) {\n      var new_node;\n      try {\n        new_node = FS.lookupNode(new_dir, new_name);\n      } catch (e) {}\n      if (new_node) {\n        if (FS.isDir(old_node.mode)) {\n          for (var i in new_node.contents) {\n            throw new FS.ErrnoError(55);\n          }\n        }\n        FS.hashRemoveNode(new_node);\n      }\n      delete old_node.parent.contents[old_node.name];\n      new_dir.contents[new_name] = old_node;\n      old_node.name = new_name;\n      new_dir.ctime =\n        new_dir.mtime =\n        old_node.parent.ctime =\n        old_node.parent.mtime =\n          Date.now();\n    },\n    unlink(parent, name) {\n      delete parent.contents[name];\n      parent.ctime = parent.mtime = Date.now();\n    },\n    rmdir(parent, name) {\n      var node = FS.lookupNode(parent, name);\n      for (var i in node.contents) {\n        throw new FS.ErrnoError(55);\n      }\n      delete parent.contents[name];\n      parent.ctime = parent.mtime = Date.now();\n    },\n    readdir(node) {\n      return ['.', '..', ...Object.keys(node.contents)];\n    },\n    symlink(parent, newname, oldpath) {\n      var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);\n      node.link = oldpath;\n      return node;\n    },\n    readlink(node) {\n      if (!FS.isLink(node.mode)) {\n        throw new FS.ErrnoError(28);\n      }\n      return node.link;\n    },\n  },\n  stream_ops: {\n    read(stream, buffer, offset, length, position) {\n      var contents = stream.node.contents;\n      if (position >= stream.node.usedBytes) return 0;\n      var size = Math.min(stream.node.usedBytes - position, length);\n      if (size > 8 && contents.subarray) {\n        buffer.set(contents.subarray(position, position + size), offset);\n      } else {\n        for (var i = 0; i < size; i++)\n          buffer[offset + i] = contents[position + i];\n      }\n      return size;\n    },\n    write(stream, buffer, offset, length, position, canOwn) {\n      if (buffer.buffer === (growMemViews(), HEAP8).buffer) {\n        canOwn = false;\n      }\n      if (!length) return 0;\n      var node = stream.node;\n      node.mtime = node.ctime = Date.now();\n      if (buffer.subarray && (!node.contents || node.contents.subarray)) {\n        if (canOwn) {\n          node.contents = buffer.subarray(offset, offset + length);\n          node.usedBytes = length;\n          return length;\n        } else if (node.usedBytes === 0 && position === 0) {\n          node.contents = buffer.slice(offset, offset + length);\n          node.usedBytes = length;\n          return length;\n        } else if (position + length <= node.usedBytes) {\n          node.contents.set(buffer.subarray(offset, offset + length), position);\n          return length;\n        }\n      }\n      MEMFS.expandFileStorage(node, position + length);\n      if (node.contents.subarray && buffer.subarray) {\n        node.contents.set(buffer.subarray(offset, offset + length), position);\n      } else {\n        for (var i = 0; i < length; i++) {\n          node.contents[position + i] = buffer[offset + i];\n        }\n      }\n      node.usedBytes = Math.max(node.usedBytes, position + length);\n      return length;\n    },\n    llseek(stream, offset, whence) {\n      var position = offset;\n      if (whence === 1) {\n        position += stream.position;\n      } else if (whence === 2) {\n        if (FS.isFile(stream.node.mode)) {\n          position += stream.node.usedBytes;\n        }\n      }\n      if (position < 0) {\n        throw new FS.ErrnoError(28);\n      }\n      return position;\n    },\n    mmap(stream, length, position, prot, flags) {\n      if (!FS.isFile(stream.node.mode)) {\n        throw new FS.ErrnoError(43);\n      }\n      var ptr;\n      var allocated;\n      var contents = stream.node.contents;\n      if (\n        !(flags & 2) &&\n        contents &&\n        contents.buffer === (growMemViews(), HEAP8).buffer\n      ) {\n        allocated = false;\n        ptr = contents.byteOffset;\n      } else {\n        allocated = true;\n        ptr = mmapAlloc(length);\n        if (!ptr) {\n          throw new FS.ErrnoError(48);\n        }\n        if (contents) {\n          if (position > 0 || position + length < contents.length) {\n            if (contents.subarray) {\n              contents = contents.subarray(position, position + length);\n            } else {\n              contents = Array.prototype.slice.call(\n                contents,\n                position,\n                position + length\n              );\n            }\n          }\n          (growMemViews(), HEAP8).set(contents, ptr >>> 0);\n        }\n      }\n      return { ptr, allocated };\n    },\n    msync(stream, buffer, offset, length, mmapFlags) {\n      MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);\n      return 0;\n    },\n  },\n};\nvar FS_modeStringToFlags = (str) => {\n  var flagModes = {\n    r: 0,\n    'r+': 2,\n    w: 512 | 64 | 1,\n    'w+': 512 | 64 | 2,\n    a: 1024 | 64 | 1,\n    'a+': 1024 | 64 | 2,\n  };\n  var flags = flagModes[str];\n  if (typeof flags == 'undefined') {\n    throw new Error(`Unknown file open mode: ${str}`);\n  }\n  return flags;\n};\nvar FS_getMode = (canRead, canWrite) => {\n  var mode = 0;\n  if (canRead) mode |= 292 | 73;\n  if (canWrite) mode |= 146;\n  return mode;\n};\nvar asyncLoad = async (url) => {\n  var arrayBuffer = await readAsync(url);\n  return new Uint8Array(arrayBuffer);\n};\nvar FS_createDataFile = (...args) => FS.createDataFile(...args);\nvar getUniqueRunDependency = (id) => id;\nvar preloadPlugins = [];\nvar FS_handledByPreloadPlugin = async (byteArray, fullname) => {\n  if (typeof Browser != 'undefined') Browser.init();\n  for (var plugin of preloadPlugins) {\n    if (plugin['canHandle'](fullname)) {\n      return plugin['handle'](byteArray, fullname);\n    }\n  }\n  return byteArray;\n};\nvar FS_preloadFile = async (\n  parent,\n  name,\n  url,\n  canRead,\n  canWrite,\n  dontCreateFile,\n  canOwn,\n  preFinish\n) => {\n  var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;\n  var dep = getUniqueRunDependency(`cp ${fullname}`);\n  addRunDependency(dep);\n  try {\n    var byteArray = url;\n    if (typeof url == 'string') {\n      byteArray = await asyncLoad(url);\n    }\n    byteArray = await FS_handledByPreloadPlugin(byteArray, fullname);\n    preFinish?.();\n    if (!dontCreateFile) {\n      FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);\n    }\n  } finally {\n    removeRunDependency(dep);\n  }\n};\nvar FS_createPreloadedFile = (\n  parent,\n  name,\n  url,\n  canRead,\n  canWrite,\n  onload,\n  onerror,\n  dontCreateFile,\n  canOwn,\n  preFinish\n) => {\n  FS_preloadFile(\n    parent,\n    name,\n    url,\n    canRead,\n    canWrite,\n    dontCreateFile,\n    canOwn,\n    preFinish\n  )\n    .then(onload)\n    .catch(onerror);\n};\nvar FS = {\n  root: null,\n  mounts: [],\n  devices: {},\n  streams: [],\n  nextInode: 1,\n  nameTable: null,\n  currentPath: '/',\n  initialized: false,\n  ignorePermissions: true,\n  filesystems: null,\n  syncFSRequests: 0,\n  readFiles: {},\n  ErrnoError: class {\n    name = 'ErrnoError';\n    constructor(errno) {\n      this.errno = errno;\n    }\n  },\n  FSStream: class {\n    shared = {};\n    get object() {\n      return this.node;\n    }\n    set object(val) {\n      this.node = val;\n    }\n    get isRead() {\n      return (this.flags & 2097155) !== 1;\n    }\n    get isWrite() {\n      return (this.flags & 2097155) !== 0;\n    }\n    get isAppend() {\n      return this.flags & 1024;\n    }\n    get flags() {\n      return this.shared.flags;\n    }\n    set flags(val) {\n      this.shared.flags = val;\n    }\n    get position() {\n      return this.shared.position;\n    }\n    set position(val) {\n      this.shared.position = val;\n    }\n  },\n  FSNode: class {\n    node_ops = {};\n    stream_ops = {};\n    readMode = 292 | 73;\n    writeMode = 146;\n    mounted = null;\n    constructor(parent, name, mode, rdev) {\n      if (!parent) {\n        parent = this;\n      }\n      this.parent = parent;\n      this.mount = parent.mount;\n      this.id = FS.nextInode++;\n      this.name = name;\n      this.mode = mode;\n      this.rdev = rdev;\n      this.atime = this.mtime = this.ctime = Date.now();\n    }\n    get read() {\n      return (this.mode & this.readMode) === this.readMode;\n    }\n    set read(val) {\n      val ? (this.mode |= this.readMode) : (this.mode &= ~this.readMode);\n    }\n    get write() {\n      return (this.mode & this.writeMode) === this.writeMode;\n    }\n    set write(val) {\n      val ? (this.mode |= this.writeMode) : (this.mode &= ~this.writeMode);\n    }\n    get isFolder() {\n      return FS.isDir(this.mode);\n    }\n    get isDevice() {\n      return FS.isChrdev(this.mode);\n    }\n  },\n  lookupPath(path, opts = {}) {\n    if (!path) {\n      throw new FS.ErrnoError(44);\n    }\n    opts.follow_mount ??= true;\n    if (!PATH.isAbs(path)) {\n      path = FS.cwd() + '/' + path;\n    }\n    linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {\n      var parts = path.split('/').filter((p) => !!p);\n      var current = FS.root;\n      var current_path = '/';\n      for (var i = 0; i < parts.length; i++) {\n        var islast = i === parts.length - 1;\n        if (islast && opts.parent) {\n          break;\n        }\n        if (parts[i] === '.') {\n          continue;\n        }\n        if (parts[i] === '..') {\n          current_path = PATH.dirname(current_path);\n          if (FS.isRoot(current)) {\n            path = current_path + '/' + parts.slice(i + 1).join('/');\n            nlinks--;\n            continue linkloop;\n          } else {\n            current = current.parent;\n          }\n          continue;\n        }\n        current_path = PATH.join2(current_path, parts[i]);\n        try {\n          current = FS.lookupNode(current, parts[i]);\n        } catch (e) {\n          if (e?.errno === 44 && islast && opts.noent_okay) {\n            return { path: current_path };\n          }\n          throw e;\n        }\n        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {\n          current = current.mounted.root;\n        }\n        if (FS.isLink(current.mode) && (!islast || opts.follow)) {\n          if (!current.node_ops.readlink) {\n            throw new FS.ErrnoError(52);\n          }\n          var link = current.node_ops.readlink(current);\n          if (!PATH.isAbs(link)) {\n            link = PATH.dirname(current_path) + '/' + link;\n          }\n          path = link + '/' + parts.slice(i + 1).join('/');\n          continue linkloop;\n        }\n      }\n      return { path: current_path, node: current };\n    }\n    throw new FS.ErrnoError(32);\n  },\n  getPath(node) {\n    var path;\n    while (true) {\n      if (FS.isRoot(node)) {\n        var mount = node.mount.mountpoint;\n        if (!path) return mount;\n        return mount[mount.length - 1] !== '/'\n          ? `${mount}/${path}`\n          : mount + path;\n      }\n      path = path ? `${node.name}/${path}` : node.name;\n      node = node.parent;\n    }\n  },\n  hashName(parentid, name) {\n    var hash = 0;\n    for (var i = 0; i < name.length; i++) {\n      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;\n    }\n    return ((parentid + hash) >>> 0) % FS.nameTable.length;\n  },\n  hashAddNode(node) {\n    var hash = FS.hashName(node.parent.id, node.name);\n    node.name_next = FS.nameTable[hash];\n    FS.nameTable[hash] = node;\n  },\n  hashRemoveNode(node) {\n    var hash = FS.hashName(node.parent.id, node.name);\n    if (FS.nameTable[hash] === node) {\n      FS.nameTable[hash] = node.name_next;\n    } else {\n      var current = FS.nameTable[hash];\n      while (current) {\n        if (current.name_next === node) {\n          current.name_next = node.name_next;\n          break;\n        }\n        current = current.name_next;\n      }\n    }\n  },\n  lookupNode(parent, name) {\n    var errCode = FS.mayLookup(parent);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    var hash = FS.hashName(parent.id, name);\n    for (var node = FS.nameTable[hash]; node; node = node.name_next) {\n      var nodeName = node.name;\n      if (node.parent.id === parent.id && nodeName === name) {\n        return node;\n      }\n    }\n    return FS.lookup(parent, name);\n  },\n  createNode(parent, name, mode, rdev) {\n    var node = new FS.FSNode(parent, name, mode, rdev);\n    FS.hashAddNode(node);\n    return node;\n  },\n  destroyNode(node) {\n    FS.hashRemoveNode(node);\n  },\n  isRoot(node) {\n    return node === node.parent;\n  },\n  isMountpoint(node) {\n    return !!node.mounted;\n  },\n  isFile(mode) {\n    return (mode & 61440) === 32768;\n  },\n  isDir(mode) {\n    return (mode & 61440) === 16384;\n  },\n  isLink(mode) {\n    return (mode & 61440) === 40960;\n  },\n  isChrdev(mode) {\n    return (mode & 61440) === 8192;\n  },\n  isBlkdev(mode) {\n    return (mode & 61440) === 24576;\n  },\n  isFIFO(mode) {\n    return (mode & 61440) === 4096;\n  },\n  isSocket(mode) {\n    return (mode & 49152) === 49152;\n  },\n  flagsToPermissionString(flag) {\n    var perms = ['r', 'w', 'rw'][flag & 3];\n    if (flag & 512) {\n      perms += 'w';\n    }\n    return perms;\n  },\n  nodePermissions(node, perms) {\n    if (FS.ignorePermissions) {\n      return 0;\n    }\n    if (perms.includes('r') && !(node.mode & 292)) {\n      return 2;\n    } else if (perms.includes('w') && !(node.mode & 146)) {\n      return 2;\n    } else if (perms.includes('x') && !(node.mode & 73)) {\n      return 2;\n    }\n    return 0;\n  },\n  mayLookup(dir) {\n    if (!FS.isDir(dir.mode)) return 54;\n    var errCode = FS.nodePermissions(dir, 'x');\n    if (errCode) return errCode;\n    if (!dir.node_ops.lookup) return 2;\n    return 0;\n  },\n  mayCreate(dir, name) {\n    if (!FS.isDir(dir.mode)) {\n      return 54;\n    }\n    try {\n      var node = FS.lookupNode(dir, name);\n      return 20;\n    } catch (e) {}\n    return FS.nodePermissions(dir, 'wx');\n  },\n  mayDelete(dir, name, isdir) {\n    var node;\n    try {\n      node = FS.lookupNode(dir, name);\n    } catch (e) {\n      return e.errno;\n    }\n    var errCode = FS.nodePermissions(dir, 'wx');\n    if (errCode) {\n      return errCode;\n    }\n    if (isdir) {\n      if (!FS.isDir(node.mode)) {\n        return 54;\n      }\n      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {\n        return 10;\n      }\n    } else {\n      if (FS.isDir(node.mode)) {\n        return 31;\n      }\n    }\n    return 0;\n  },\n  mayOpen(node, flags) {\n    if (!node) {\n      return 44;\n    }\n    if (FS.isLink(node.mode)) {\n      return 32;\n    } else if (FS.isDir(node.mode)) {\n      if (FS.flagsToPermissionString(flags) !== 'r' || flags & (512 | 64)) {\n        return 31;\n      }\n    }\n    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));\n  },\n  checkOpExists(op, err) {\n    if (!op) {\n      throw new FS.ErrnoError(err);\n    }\n    return op;\n  },\n  MAX_OPEN_FDS: 4096,\n  nextfd() {\n    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {\n      if (!FS.streams[fd]) {\n        return fd;\n      }\n    }\n    throw new FS.ErrnoError(33);\n  },\n  getStreamChecked(fd) {\n    var stream = FS.getStream(fd);\n    if (!stream) {\n      throw new FS.ErrnoError(8);\n    }\n    return stream;\n  },\n  getStream: (fd) => FS.streams[fd],\n  createStream(stream, fd = -1) {\n    stream = Object.assign(new FS.FSStream(), stream);\n    if (fd == -1) {\n      fd = FS.nextfd();\n    }\n    stream.fd = fd;\n    FS.streams[fd] = stream;\n    return stream;\n  },\n  closeStream(fd) {\n    FS.streams[fd] = null;\n  },\n  dupStream(origStream, fd = -1) {\n    var stream = FS.createStream(origStream, fd);\n    stream.stream_ops?.dup?.(stream);\n    return stream;\n  },\n  doSetAttr(stream, node, attr) {\n    var setattr = stream?.stream_ops.setattr;\n    var arg = setattr ? stream : node;\n    setattr ??= node.node_ops.setattr;\n    FS.checkOpExists(setattr, 63);\n    setattr(arg, attr);\n  },\n  chrdev_stream_ops: {\n    open(stream) {\n      var device = FS.getDevice(stream.node.rdev);\n      stream.stream_ops = device.stream_ops;\n      stream.stream_ops.open?.(stream);\n    },\n    llseek() {\n      throw new FS.ErrnoError(70);\n    },\n  },\n  major: (dev) => dev >> 8,\n  minor: (dev) => dev & 255,\n  makedev: (ma, mi) => (ma << 8) | mi,\n  registerDevice(dev, ops) {\n    FS.devices[dev] = { stream_ops: ops };\n  },\n  getDevice: (dev) => FS.devices[dev],\n  getMounts(mount) {\n    var mounts = [];\n    var check = [mount];\n    while (check.length) {\n      var m = check.pop();\n      mounts.push(m);\n      check.push(...m.mounts);\n    }\n    return mounts;\n  },\n  syncfs(populate, callback) {\n    if (typeof populate == 'function') {\n      callback = populate;\n      populate = false;\n    }\n    FS.syncFSRequests++;\n    if (FS.syncFSRequests > 1) {\n      err(\n        `warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`\n      );\n    }\n    var mounts = FS.getMounts(FS.root.mount);\n    var completed = 0;\n    function doCallback(errCode) {\n      FS.syncFSRequests--;\n      return callback(errCode);\n    }\n    function done(errCode) {\n      if (errCode) {\n        if (!done.errored) {\n          done.errored = true;\n          return doCallback(errCode);\n        }\n        return;\n      }\n      if (++completed >= mounts.length) {\n        doCallback(null);\n      }\n    }\n    for (var mount of mounts) {\n      if (mount.type.syncfs) {\n        mount.type.syncfs(mount, populate, done);\n      } else {\n        done(null);\n      }\n    }\n  },\n  mount(type, opts, mountpoint) {\n    var root = mountpoint === '/';\n    var pseudo = !mountpoint;\n    var node;\n    if (root && FS.root) {\n      throw new FS.ErrnoError(10);\n    } else if (!root && !pseudo) {\n      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });\n      mountpoint = lookup.path;\n      node = lookup.node;\n      if (FS.isMountpoint(node)) {\n        throw new FS.ErrnoError(10);\n      }\n      if (!FS.isDir(node.mode)) {\n        throw new FS.ErrnoError(54);\n      }\n    }\n    var mount = { type, opts, mountpoint, mounts: [] };\n    var mountRoot = type.mount(mount);\n    mountRoot.mount = mount;\n    mount.root = mountRoot;\n    if (root) {\n      FS.root = mountRoot;\n    } else if (node) {\n      node.mounted = mount;\n      if (node.mount) {\n        node.mount.mounts.push(mount);\n      }\n    }\n    return mountRoot;\n  },\n  unmount(mountpoint) {\n    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });\n    if (!FS.isMountpoint(lookup.node)) {\n      throw new FS.ErrnoError(28);\n    }\n    var node = lookup.node;\n    var mount = node.mounted;\n    var mounts = FS.getMounts(mount);\n    for (var [hash, current] of Object.entries(FS.nameTable)) {\n      while (current) {\n        var next = current.name_next;\n        if (mounts.includes(current.mount)) {\n          FS.destroyNode(current);\n        }\n        current = next;\n      }\n    }\n    node.mounted = null;\n    var idx = node.mount.mounts.indexOf(mount);\n    node.mount.mounts.splice(idx, 1);\n  },\n  lookup(parent, name) {\n    return parent.node_ops.lookup(parent, name);\n  },\n  mknod(path, mode, dev) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    var name = PATH.basename(path);\n    if (!name) {\n      throw new FS.ErrnoError(28);\n    }\n    if (name === '.' || name === '..') {\n      throw new FS.ErrnoError(20);\n    }\n    var errCode = FS.mayCreate(parent, name);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.mknod) {\n      throw new FS.ErrnoError(63);\n    }\n    return parent.node_ops.mknod(parent, name, mode, dev);\n  },\n  statfs(path) {\n    return FS.statfsNode(FS.lookupPath(path, { follow: true }).node);\n  },\n  statfsStream(stream) {\n    return FS.statfsNode(stream.node);\n  },\n  statfsNode(node) {\n    var rtn = {\n      bsize: 4096,\n      frsize: 4096,\n      blocks: 1e6,\n      bfree: 5e5,\n      bavail: 5e5,\n      files: FS.nextInode,\n      ffree: FS.nextInode - 1,\n      fsid: 42,\n      flags: 2,\n      namelen: 255,\n    };\n    if (node.node_ops.statfs) {\n      Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));\n    }\n    return rtn;\n  },\n  create(path, mode = 438) {\n    mode &= 4095;\n    mode |= 32768;\n    return FS.mknod(path, mode, 0);\n  },\n  mkdir(path, mode = 511) {\n    mode &= 511 | 512;\n    mode |= 16384;\n    return FS.mknod(path, mode, 0);\n  },\n  mkdirTree(path, mode) {\n    var dirs = path.split('/');\n    var d = '';\n    for (var dir of dirs) {\n      if (!dir) continue;\n      if (d || PATH.isAbs(path)) d += '/';\n      d += dir;\n      try {\n        FS.mkdir(d, mode);\n      } catch (e) {\n        if (e.errno != 20) throw e;\n      }\n    }\n  },\n  mkdev(path, mode, dev) {\n    if (typeof dev == 'undefined') {\n      dev = mode;\n      mode = 438;\n    }\n    mode |= 8192;\n    return FS.mknod(path, mode, dev);\n  },\n  symlink(oldpath, newpath) {\n    if (!PATH_FS.resolve(oldpath)) {\n      throw new FS.ErrnoError(44);\n    }\n    var lookup = FS.lookupPath(newpath, { parent: true });\n    var parent = lookup.node;\n    if (!parent) {\n      throw new FS.ErrnoError(44);\n    }\n    var newname = PATH.basename(newpath);\n    var errCode = FS.mayCreate(parent, newname);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.symlink) {\n      throw new FS.ErrnoError(63);\n    }\n    return parent.node_ops.symlink(parent, newname, oldpath);\n  },\n  rename(old_path, new_path) {\n    var old_dirname = PATH.dirname(old_path);\n    var new_dirname = PATH.dirname(new_path);\n    var old_name = PATH.basename(old_path);\n    var new_name = PATH.basename(new_path);\n    var lookup, old_dir, new_dir;\n    lookup = FS.lookupPath(old_path, { parent: true });\n    old_dir = lookup.node;\n    lookup = FS.lookupPath(new_path, { parent: true });\n    new_dir = lookup.node;\n    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);\n    if (old_dir.mount !== new_dir.mount) {\n      throw new FS.ErrnoError(75);\n    }\n    var old_node = FS.lookupNode(old_dir, old_name);\n    var relative = PATH_FS.relative(old_path, new_dirname);\n    if (relative.charAt(0) !== '.') {\n      throw new FS.ErrnoError(28);\n    }\n    relative = PATH_FS.relative(new_path, old_dirname);\n    if (relative.charAt(0) !== '.') {\n      throw new FS.ErrnoError(55);\n    }\n    var new_node;\n    try {\n      new_node = FS.lookupNode(new_dir, new_name);\n    } catch (e) {}\n    if (old_node === new_node) {\n      return;\n    }\n    var isdir = FS.isDir(old_node.mode);\n    var errCode = FS.mayDelete(old_dir, old_name, isdir);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    errCode = new_node\n      ? FS.mayDelete(new_dir, new_name, isdir)\n      : FS.mayCreate(new_dir, new_name);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!old_dir.node_ops.rename) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {\n      throw new FS.ErrnoError(10);\n    }\n    if (new_dir !== old_dir) {\n      errCode = FS.nodePermissions(old_dir, 'w');\n      if (errCode) {\n        throw new FS.ErrnoError(errCode);\n      }\n    }\n    FS.hashRemoveNode(old_node);\n    try {\n      old_dir.node_ops.rename(old_node, new_dir, new_name);\n      old_node.parent = new_dir;\n    } catch (e) {\n      throw e;\n    } finally {\n      FS.hashAddNode(old_node);\n    }\n  },\n  rmdir(path) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    var name = PATH.basename(path);\n    var node = FS.lookupNode(parent, name);\n    var errCode = FS.mayDelete(parent, name, true);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.rmdir) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(node)) {\n      throw new FS.ErrnoError(10);\n    }\n    parent.node_ops.rmdir(parent, name);\n    FS.destroyNode(node);\n  },\n  readdir(path) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    var node = lookup.node;\n    var readdir = FS.checkOpExists(node.node_ops.readdir, 54);\n    return readdir(node);\n  },\n  unlink(path) {\n    var lookup = FS.lookupPath(path, { parent: true });\n    var parent = lookup.node;\n    if (!parent) {\n      throw new FS.ErrnoError(44);\n    }\n    var name = PATH.basename(path);\n    var node = FS.lookupNode(parent, name);\n    var errCode = FS.mayDelete(parent, name, false);\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    if (!parent.node_ops.unlink) {\n      throw new FS.ErrnoError(63);\n    }\n    if (FS.isMountpoint(node)) {\n      throw new FS.ErrnoError(10);\n    }\n    parent.node_ops.unlink(parent, name);\n    FS.destroyNode(node);\n  },\n  readlink(path) {\n    var lookup = FS.lookupPath(path);\n    var link = lookup.node;\n    if (!link) {\n      throw new FS.ErrnoError(44);\n    }\n    if (!link.node_ops.readlink) {\n      throw new FS.ErrnoError(28);\n    }\n    return link.node_ops.readlink(link);\n  },\n  stat(path, dontFollow) {\n    var lookup = FS.lookupPath(path, { follow: !dontFollow });\n    var node = lookup.node;\n    var getattr = FS.checkOpExists(node.node_ops.getattr, 63);\n    return getattr(node);\n  },\n  fstat(fd) {\n    var stream = FS.getStreamChecked(fd);\n    var node = stream.node;\n    var getattr = stream.stream_ops.getattr;\n    var arg = getattr ? stream : node;\n    getattr ??= node.node_ops.getattr;\n    FS.checkOpExists(getattr, 63);\n    return getattr(arg);\n  },\n  lstat(path) {\n    return FS.stat(path, true);\n  },\n  doChmod(stream, node, mode, dontFollow) {\n    FS.doSetAttr(stream, node, {\n      mode: (mode & 4095) | (node.mode & ~4095),\n      ctime: Date.now(),\n      dontFollow,\n    });\n  },\n  chmod(path, mode, dontFollow) {\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: !dontFollow });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doChmod(null, node, mode, dontFollow);\n  },\n  lchmod(path, mode) {\n    FS.chmod(path, mode, true);\n  },\n  fchmod(fd, mode) {\n    var stream = FS.getStreamChecked(fd);\n    FS.doChmod(stream, stream.node, mode, false);\n  },\n  doChown(stream, node, dontFollow) {\n    FS.doSetAttr(stream, node, { timestamp: Date.now(), dontFollow });\n  },\n  chown(path, uid, gid, dontFollow) {\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: !dontFollow });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doChown(null, node, dontFollow);\n  },\n  lchown(path, uid, gid) {\n    FS.chown(path, uid, gid, true);\n  },\n  fchown(fd, uid, gid) {\n    var stream = FS.getStreamChecked(fd);\n    FS.doChown(stream, stream.node, false);\n  },\n  doTruncate(stream, node, len) {\n    if (FS.isDir(node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!FS.isFile(node.mode)) {\n      throw new FS.ErrnoError(28);\n    }\n    var errCode = FS.nodePermissions(node, 'w');\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    FS.doSetAttr(stream, node, { size: len, timestamp: Date.now() });\n  },\n  truncate(path, len) {\n    if (len < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    var node;\n    if (typeof path == 'string') {\n      var lookup = FS.lookupPath(path, { follow: true });\n      node = lookup.node;\n    } else {\n      node = path;\n    }\n    FS.doTruncate(null, node, len);\n  },\n  ftruncate(fd, len) {\n    var stream = FS.getStreamChecked(fd);\n    if (len < 0 || (stream.flags & 2097155) === 0) {\n      throw new FS.ErrnoError(28);\n    }\n    FS.doTruncate(stream, stream.node, len);\n  },\n  utime(path, atime, mtime) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    var node = lookup.node;\n    var setattr = FS.checkOpExists(node.node_ops.setattr, 63);\n    setattr(node, { atime, mtime });\n  },\n  open(path, flags, mode = 438) {\n    if (path === '') {\n      throw new FS.ErrnoError(44);\n    }\n    flags = typeof flags == 'string' ? FS_modeStringToFlags(flags) : flags;\n    if (flags & 64) {\n      mode = (mode & 4095) | 32768;\n    } else {\n      mode = 0;\n    }\n    var node;\n    var isDirPath;\n    if (typeof path == 'object') {\n      node = path;\n    } else {\n      isDirPath = path.endsWith('/');\n      var lookup = FS.lookupPath(path, {\n        follow: !(flags & 131072),\n        noent_okay: true,\n      });\n      node = lookup.node;\n      path = lookup.path;\n    }\n    var created = false;\n    if (flags & 64) {\n      if (node) {\n        if (flags & 128) {\n          throw new FS.ErrnoError(20);\n        }\n      } else if (isDirPath) {\n        throw new FS.ErrnoError(31);\n      } else {\n        node = FS.mknod(path, mode | 511, 0);\n        created = true;\n      }\n    }\n    if (!node) {\n      throw new FS.ErrnoError(44);\n    }\n    if (FS.isChrdev(node.mode)) {\n      flags &= ~512;\n    }\n    if (flags & 65536 && !FS.isDir(node.mode)) {\n      throw new FS.ErrnoError(54);\n    }\n    if (!created) {\n      var errCode = FS.mayOpen(node, flags);\n      if (errCode) {\n        throw new FS.ErrnoError(errCode);\n      }\n    }\n    if (flags & 512 && !created) {\n      FS.truncate(node, 0);\n    }\n    flags &= ~(128 | 512 | 131072);\n    var stream = FS.createStream({\n      node,\n      path: FS.getPath(node),\n      flags,\n      seekable: true,\n      position: 0,\n      stream_ops: node.stream_ops,\n      ungotten: [],\n      error: false,\n    });\n    if (stream.stream_ops.open) {\n      stream.stream_ops.open(stream);\n    }\n    if (created) {\n      FS.chmod(node, mode & 511);\n    }\n    if (Module['logReadFiles'] && !(flags & 1)) {\n      if (!(path in FS.readFiles)) {\n        FS.readFiles[path] = 1;\n      }\n    }\n    return stream;\n  },\n  close(stream) {\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if (stream.getdents) stream.getdents = null;\n    try {\n      if (stream.stream_ops.close) {\n        stream.stream_ops.close(stream);\n      }\n    } catch (e) {\n      throw e;\n    } finally {\n      FS.closeStream(stream.fd);\n    }\n    stream.fd = null;\n  },\n  isClosed(stream) {\n    return stream.fd === null;\n  },\n  llseek(stream, offset, whence) {\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if (!stream.seekable || !stream.stream_ops.llseek) {\n      throw new FS.ErrnoError(70);\n    }\n    if (whence != 0 && whence != 1 && whence != 2) {\n      throw new FS.ErrnoError(28);\n    }\n    stream.position = stream.stream_ops.llseek(stream, offset, whence);\n    stream.ungotten = [];\n    return stream.position;\n  },\n  read(stream, buffer, offset, length, position) {\n    if (length < 0 || position < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if ((stream.flags & 2097155) === 1) {\n      throw new FS.ErrnoError(8);\n    }\n    if (FS.isDir(stream.node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!stream.stream_ops.read) {\n      throw new FS.ErrnoError(28);\n    }\n    var seeking = typeof position != 'undefined';\n    if (!seeking) {\n      position = stream.position;\n    } else if (!stream.seekable) {\n      throw new FS.ErrnoError(70);\n    }\n    var bytesRead = stream.stream_ops.read(\n      stream,\n      buffer,\n      offset,\n      length,\n      position\n    );\n    if (!seeking) stream.position += bytesRead;\n    return bytesRead;\n  },\n  write(stream, buffer, offset, length, position, canOwn) {\n    if (length < 0 || position < 0) {\n      throw new FS.ErrnoError(28);\n    }\n    if (FS.isClosed(stream)) {\n      throw new FS.ErrnoError(8);\n    }\n    if ((stream.flags & 2097155) === 0) {\n      throw new FS.ErrnoError(8);\n    }\n    if (FS.isDir(stream.node.mode)) {\n      throw new FS.ErrnoError(31);\n    }\n    if (!stream.stream_ops.write) {\n      throw new FS.ErrnoError(28);\n    }\n    if (stream.seekable && stream.flags & 1024) {\n      FS.llseek(stream, 0, 2);\n    }\n    var seeking = typeof position != 'undefined';\n    if (!seeking) {\n      position = stream.position;\n    } else if (!stream.seekable) {\n      throw new FS.ErrnoError(70);\n    }\n    var bytesWritten = stream.stream_ops.write(\n      stream,\n      buffer,\n      offset,\n      length,\n      position,\n      canOwn\n    );\n    if (!seeking) stream.position += bytesWritten;\n    return bytesWritten;\n  },\n  mmap(stream, length, position, prot, flags) {\n    if (\n      (prot & 2) !== 0 &&\n      (flags & 2) === 0 &&\n      (stream.flags & 2097155) !== 2\n    ) {\n      throw new FS.ErrnoError(2);\n    }\n    if ((stream.flags & 2097155) === 1) {\n      throw new FS.ErrnoError(2);\n    }\n    if (!stream.stream_ops.mmap) {\n      throw new FS.ErrnoError(43);\n    }\n    if (!length) {\n      throw new FS.ErrnoError(28);\n    }\n    return stream.stream_ops.mmap(stream, length, position, prot, flags);\n  },\n  msync(stream, buffer, offset, length, mmapFlags) {\n    if (!stream.stream_ops.msync) {\n      return 0;\n    }\n    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);\n  },\n  ioctl(stream, cmd, arg) {\n    if (!stream.stream_ops.ioctl) {\n      throw new FS.ErrnoError(59);\n    }\n    return stream.stream_ops.ioctl(stream, cmd, arg);\n  },\n  readFile(path, opts = {}) {\n    opts.flags = opts.flags || 0;\n    opts.encoding = opts.encoding || 'binary';\n    if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {\n      abort(`Invalid encoding type \"${opts.encoding}\"`);\n    }\n    var stream = FS.open(path, opts.flags);\n    var stat = FS.stat(path);\n    var length = stat.size;\n    var buf = new Uint8Array(length);\n    FS.read(stream, buf, 0, length, 0);\n    if (opts.encoding === 'utf8') {\n      buf = UTF8ArrayToString(buf);\n    }\n    FS.close(stream);\n    return buf;\n  },\n  writeFile(path, data, opts = {}) {\n    opts.flags = opts.flags || 577;\n    var stream = FS.open(path, opts.flags, opts.mode);\n    if (typeof data == 'string') {\n      data = new Uint8Array(intArrayFromString(data, true));\n    }\n    if (ArrayBuffer.isView(data)) {\n      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);\n    } else {\n      abort('Unsupported data type');\n    }\n    FS.close(stream);\n  },\n  cwd: () => FS.currentPath,\n  chdir(path) {\n    var lookup = FS.lookupPath(path, { follow: true });\n    if (lookup.node === null) {\n      throw new FS.ErrnoError(44);\n    }\n    if (!FS.isDir(lookup.node.mode)) {\n      throw new FS.ErrnoError(54);\n    }\n    var errCode = FS.nodePermissions(lookup.node, 'x');\n    if (errCode) {\n      throw new FS.ErrnoError(errCode);\n    }\n    FS.currentPath = lookup.path;\n  },\n  createDefaultDirectories() {\n    FS.mkdir('/tmp');\n    FS.mkdir('/home');\n    FS.mkdir('/home/web_user');\n  },\n  createDefaultDevices() {\n    FS.mkdir('/dev');\n    FS.registerDevice(FS.makedev(1, 3), {\n      read: () => 0,\n      write: (stream, buffer, offset, length, pos) => length,\n      llseek: () => 0,\n    });\n    FS.mkdev('/dev/null', FS.makedev(1, 3));\n    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);\n    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);\n    FS.mkdev('/dev/tty', FS.makedev(5, 0));\n    FS.mkdev('/dev/tty1', FS.makedev(6, 0));\n    var randomBuffer = new Uint8Array(1024),\n      randomLeft = 0;\n    var randomByte = () => {\n      if (randomLeft === 0) {\n        randomFill(randomBuffer);\n        randomLeft = randomBuffer.byteLength;\n      }\n      return randomBuffer[--randomLeft];\n    };\n    FS.createDevice('/dev', 'random', randomByte);\n    FS.createDevice('/dev', 'urandom', randomByte);\n    FS.mkdir('/dev/shm');\n    FS.mkdir('/dev/shm/tmp');\n  },\n  createSpecialDirectories() {\n    FS.mkdir('/proc');\n    var proc_self = FS.mkdir('/proc/self');\n    FS.mkdir('/proc/self/fd');\n    FS.mount(\n      {\n        mount() {\n          var node = FS.createNode(proc_self, 'fd', 16895, 73);\n          node.stream_ops = { llseek: MEMFS.stream_ops.llseek };\n          node.node_ops = {\n            lookup(parent, name) {\n              var fd = +name;\n              var stream = FS.getStreamChecked(fd);\n              var ret = {\n                parent: null,\n                mount: { mountpoint: 'fake' },\n                node_ops: { readlink: () => stream.path },\n                id: fd + 1,\n              };\n              ret.parent = ret;\n              return ret;\n            },\n            readdir() {\n              return Array.from(FS.streams.entries())\n                .filter(([k, v]) => v)\n                .map(([k, v]) => k.toString());\n            },\n          };\n          return node;\n        },\n      },\n      {},\n      '/proc/self/fd'\n    );\n  },\n  createStandardStreams(input, output, error) {\n    if (input) {\n      FS.createDevice('/dev', 'stdin', input);\n    } else {\n      FS.symlink('/dev/tty', '/dev/stdin');\n    }\n    if (output) {\n      FS.createDevice('/dev', 'stdout', null, output);\n    } else {\n      FS.symlink('/dev/tty', '/dev/stdout');\n    }\n    if (error) {\n      FS.createDevice('/dev', 'stderr', null, error);\n    } else {\n      FS.symlink('/dev/tty1', '/dev/stderr');\n    }\n    var stdin = FS.open('/dev/stdin', 0);\n    var stdout = FS.open('/dev/stdout', 1);\n    var stderr = FS.open('/dev/stderr', 1);\n  },\n  staticInit() {\n    FS.nameTable = new Array(4096);\n    FS.mount(MEMFS, {}, '/');\n    FS.createDefaultDirectories();\n    FS.createDefaultDevices();\n    FS.createSpecialDirectories();\n    FS.filesystems = { MEMFS };\n  },\n  init(input, output, error) {\n    FS.initialized = true;\n    input ??= Module['stdin'];\n    output ??= Module['stdout'];\n    error ??= Module['stderr'];\n    FS.createStandardStreams(input, output, error);\n  },\n  quit() {\n    FS.initialized = false;\n    for (var stream of FS.streams) {\n      if (stream) {\n        FS.close(stream);\n      }\n    }\n  },\n  findObject(path, dontResolveLastLink) {\n    var ret = FS.analyzePath(path, dontResolveLastLink);\n    if (!ret.exists) {\n      return null;\n    }\n    return ret.object;\n  },\n  analyzePath(path, dontResolveLastLink) {\n    try {\n      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });\n      path = lookup.path;\n    } catch (e) {}\n    var ret = {\n      isRoot: false,\n      exists: false,\n      error: 0,\n      name: null,\n      path: null,\n      object: null,\n      parentExists: false,\n      parentPath: null,\n      parentObject: null,\n    };\n    try {\n      var lookup = FS.lookupPath(path, { parent: true });\n      ret.parentExists = true;\n      ret.parentPath = lookup.path;\n      ret.parentObject = lookup.node;\n      ret.name = PATH.basename(path);\n      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });\n      ret.exists = true;\n      ret.path = lookup.path;\n      ret.object = lookup.node;\n      ret.name = lookup.node.name;\n      ret.isRoot = lookup.path === '/';\n    } catch (e) {\n      ret.error = e.errno;\n    }\n    return ret;\n  },\n  createPath(parent, path, canRead, canWrite) {\n    parent = typeof parent == 'string' ? parent : FS.getPath(parent);\n    var parts = path.split('/').reverse();\n    while (parts.length) {\n      var part = parts.pop();\n      if (!part) continue;\n      var current = PATH.join2(parent, part);\n      try {\n        FS.mkdir(current);\n      } catch (e) {\n        if (e.errno != 20) throw e;\n      }\n      parent = current;\n    }\n    return current;\n  },\n  createFile(parent, name, properties, canRead, canWrite) {\n    var path = PATH.join2(\n      typeof parent == 'string' ? parent : FS.getPath(parent),\n      name\n    );\n    var mode = FS_getMode(canRead, canWrite);\n    return FS.create(path, mode);\n  },\n  createDataFile(parent, name, data, canRead, canWrite, canOwn) {\n    var path = name;\n    if (parent) {\n      parent = typeof parent == 'string' ? parent : FS.getPath(parent);\n      path = name ? PATH.join2(parent, name) : parent;\n    }\n    var mode = FS_getMode(canRead, canWrite);\n    var node = FS.create(path, mode);\n    if (data) {\n      if (typeof data == 'string') {\n        var arr = new Array(data.length);\n        for (var i = 0, len = data.length; i < len; ++i)\n          arr[i] = data.charCodeAt(i);\n        data = arr;\n      }\n      FS.chmod(node, mode | 146);\n      var stream = FS.open(node, 577);\n      FS.write(stream, data, 0, data.length, 0, canOwn);\n      FS.close(stream);\n      FS.chmod(node, mode);\n    }\n  },\n  createDevice(parent, name, input, output) {\n    var path = PATH.join2(\n      typeof parent == 'string' ? parent : FS.getPath(parent),\n      name\n    );\n    var mode = FS_getMode(!!input, !!output);\n    FS.createDevice.major ??= 64;\n    var dev = FS.makedev(FS.createDevice.major++, 0);\n    FS.registerDevice(dev, {\n      open(stream) {\n        stream.seekable = false;\n      },\n      close(stream) {\n        if (output?.buffer?.length) {\n          output(10);\n        }\n      },\n      read(stream, buffer, offset, length, pos) {\n        var bytesRead = 0;\n        for (var i = 0; i < length; i++) {\n          var result;\n          try {\n            result = input();\n          } catch (e) {\n            throw new FS.ErrnoError(29);\n          }\n          if (result === undefined && bytesRead === 0) {\n            throw new FS.ErrnoError(6);\n          }\n          if (result === null || result === undefined) break;\n          bytesRead++;\n          buffer[offset + i] = result;\n        }\n        if (bytesRead) {\n          stream.node.atime = Date.now();\n        }\n        return bytesRead;\n      },\n      write(stream, buffer, offset, length, pos) {\n        for (var i = 0; i < length; i++) {\n          try {\n            output(buffer[offset + i]);\n          } catch (e) {\n            throw new FS.ErrnoError(29);\n          }\n        }\n        if (length) {\n          stream.node.mtime = stream.node.ctime = Date.now();\n        }\n        return i;\n      },\n    });\n    return FS.mkdev(path, mode, dev);\n  },\n  forceLoadFile(obj) {\n    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;\n    if (globalThis.XMLHttpRequest) {\n      abort(\n        'Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.'\n      );\n    } else {\n      try {\n        obj.contents = readBinary(obj.url);\n      } catch (e) {\n        throw new FS.ErrnoError(29);\n      }\n    }\n  },\n  createLazyFile(parent, name, url, canRead, canWrite) {\n    class LazyUint8Array {\n      lengthKnown = false;\n      chunks = [];\n      get(idx) {\n        if (idx > this.length - 1 || idx < 0) {\n          return undefined;\n        }\n        var chunkOffset = idx % this.chunkSize;\n        var chunkNum = (idx / this.chunkSize) | 0;\n        return this.getter(chunkNum)[chunkOffset];\n      }\n      setDataGetter(getter) {\n        this.getter = getter;\n      }\n      cacheLength() {\n        var xhr = new XMLHttpRequest();\n        xhr.open('HEAD', url, false);\n        xhr.send(null);\n        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))\n          abort(\"Couldn't load \" + url + '. Status: ' + xhr.status);\n        var datalength = Number(xhr.getResponseHeader('Content-length'));\n        var header;\n        var hasByteServing =\n          (header = xhr.getResponseHeader('Accept-Ranges')) &&\n          header === 'bytes';\n        var usesGzip =\n          (header = xhr.getResponseHeader('Content-Encoding')) &&\n          header === 'gzip';\n        var chunkSize = 1024 * 1024;\n        if (!hasByteServing) chunkSize = datalength;\n        var doXHR = (from, to) => {\n          if (from > to)\n            abort(\n              'invalid range (' + from + ', ' + to + ') or no bytes requested!'\n            );\n          if (to > datalength - 1)\n            abort('only ' + datalength + ' bytes available! programmer error!');\n          var xhr = new XMLHttpRequest();\n          xhr.open('GET', url, false);\n          if (datalength !== chunkSize)\n            xhr.setRequestHeader('Range', 'bytes=' + from + '-' + to);\n          xhr.responseType = 'arraybuffer';\n          if (xhr.overrideMimeType) {\n            xhr.overrideMimeType('text/plain; charset=x-user-defined');\n          }\n          xhr.send(null);\n          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))\n            abort(\"Couldn't load \" + url + '. Status: ' + xhr.status);\n          if (xhr.response !== undefined) {\n            return new Uint8Array(xhr.response || []);\n          }\n          return intArrayFromString(xhr.responseText || '', true);\n        };\n        var lazyArray = this;\n        lazyArray.setDataGetter((chunkNum) => {\n          var start = chunkNum * chunkSize;\n          var end = (chunkNum + 1) * chunkSize - 1;\n          end = Math.min(end, datalength - 1);\n          if (typeof lazyArray.chunks[chunkNum] == 'undefined') {\n            lazyArray.chunks[chunkNum] = doXHR(start, end);\n          }\n          if (typeof lazyArray.chunks[chunkNum] == 'undefined')\n            abort('doXHR failed!');\n          return lazyArray.chunks[chunkNum];\n        });\n        if (usesGzip || !datalength) {\n          chunkSize = datalength = 1;\n          datalength = this.getter(0).length;\n          chunkSize = datalength;\n          out(\n            'LazyFiles on gzip forces download of the whole file when length is accessed'\n          );\n        }\n        this._length = datalength;\n        this._chunkSize = chunkSize;\n        this.lengthKnown = true;\n      }\n      get length() {\n        if (!this.lengthKnown) {\n          this.cacheLength();\n        }\n        return this._length;\n      }\n      get chunkSize() {\n        if (!this.lengthKnown) {\n          this.cacheLength();\n        }\n        return this._chunkSize;\n      }\n    }\n    if (globalThis.XMLHttpRequest) {\n      if (!ENVIRONMENT_IS_WORKER)\n        abort(\n          'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc'\n        );\n      var lazyArray = new LazyUint8Array();\n      var properties = { isDevice: false, contents: lazyArray };\n    } else {\n      var properties = { isDevice: false, url };\n    }\n    var node = FS.createFile(parent, name, properties, canRead, canWrite);\n    if (properties.contents) {\n      node.contents = properties.contents;\n    } else if (properties.url) {\n      node.contents = null;\n      node.url = properties.url;\n    }\n    Object.defineProperties(node, {\n      usedBytes: {\n        get: function () {\n          return this.contents.length;\n        },\n      },\n    });\n    var stream_ops = {};\n    for (const [key, fn] of Object.entries(node.stream_ops)) {\n      stream_ops[key] = (...args) => {\n        FS.forceLoadFile(node);\n        return fn(...args);\n      };\n    }\n    function writeChunks(stream, buffer, offset, length, position) {\n      var contents = stream.node.contents;\n      if (position >= contents.length) return 0;\n      var size = Math.min(contents.length - position, length);\n      if (contents.slice) {\n        for (var i = 0; i < size; i++) {\n          buffer[offset + i] = contents[position + i];\n        }\n      } else {\n        for (var i = 0; i < size; i++) {\n          buffer[offset + i] = contents.get(position + i);\n        }\n      }\n      return size;\n    }\n    stream_ops.read = (stream, buffer, offset, length, position) => {\n      FS.forceLoadFile(node);\n      return writeChunks(stream, buffer, offset, length, position);\n    };\n    stream_ops.mmap = (stream, length, position, prot, flags) => {\n      FS.forceLoadFile(node);\n      var ptr = mmapAlloc(length);\n      if (!ptr) {\n        throw new FS.ErrnoError(48);\n      }\n      writeChunks(stream, (growMemViews(), HEAP8), ptr, length, position);\n      return { ptr, allocated: true };\n    };\n    node.stream_ops = stream_ops;\n    return node;\n  },\n};\nvar SYSCALLS = {\n  DEFAULT_POLLMASK: 5,\n  calculateAt(dirfd, path, allowEmpty) {\n    if (PATH.isAbs(path)) {\n      return path;\n    }\n    var dir;\n    if (dirfd === -100) {\n      dir = FS.cwd();\n    } else {\n      var dirstream = SYSCALLS.getStreamFromFD(dirfd);\n      dir = dirstream.path;\n    }\n    if (path.length == 0) {\n      if (!allowEmpty) {\n        throw new FS.ErrnoError(44);\n      }\n      return dir;\n    }\n    return dir + '/' + path;\n  },\n  writeStat(buf, stat) {\n    (growMemViews(), HEAPU32)[(buf >>> 2) >>> 0] = stat.dev;\n    (growMemViews(), HEAPU32)[((buf + 4) >>> 2) >>> 0] = stat.mode;\n    (growMemViews(), HEAPU32)[((buf + 8) >>> 2) >>> 0] = stat.nlink;\n    (growMemViews(), HEAPU32)[((buf + 12) >>> 2) >>> 0] = stat.uid;\n    (growMemViews(), HEAPU32)[((buf + 16) >>> 2) >>> 0] = stat.gid;\n    (growMemViews(), HEAPU32)[((buf + 20) >>> 2) >>> 0] = stat.rdev;\n    (growMemViews(), HEAP64)[((buf + 24) >>> 3) >>> 0] = BigInt(stat.size);\n    (growMemViews(), HEAP32)[((buf + 32) >>> 2) >>> 0] = 4096;\n    (growMemViews(), HEAP32)[((buf + 36) >>> 2) >>> 0] = stat.blocks;\n    var atime = stat.atime.getTime();\n    var mtime = stat.mtime.getTime();\n    var ctime = stat.ctime.getTime();\n    (growMemViews(), HEAP64)[((buf + 40) >>> 3) >>> 0] = BigInt(\n      Math.floor(atime / 1e3)\n    );\n    (growMemViews(), HEAPU32)[((buf + 48) >>> 2) >>> 0] =\n      (atime % 1e3) * 1e3 * 1e3;\n    (growMemViews(), HEAP64)[((buf + 56) >>> 3) >>> 0] = BigInt(\n      Math.floor(mtime / 1e3)\n    );\n    (growMemViews(), HEAPU32)[((buf + 64) >>> 2) >>> 0] =\n      (mtime % 1e3) * 1e3 * 1e3;\n    (growMemViews(), HEAP64)[((buf + 72) >>> 3) >>> 0] = BigInt(\n      Math.floor(ctime / 1e3)\n    );\n    (growMemViews(), HEAPU32)[((buf + 80) >>> 2) >>> 0] =\n      (ctime % 1e3) * 1e3 * 1e3;\n    (growMemViews(), HEAP64)[((buf + 88) >>> 3) >>> 0] = BigInt(stat.ino);\n    return 0;\n  },\n  writeStatFs(buf, stats) {\n    (growMemViews(), HEAPU32)[((buf + 4) >>> 2) >>> 0] = stats.bsize;\n    (growMemViews(), HEAPU32)[((buf + 60) >>> 2) >>> 0] = stats.bsize;\n    (growMemViews(), HEAP64)[((buf + 8) >>> 3) >>> 0] = BigInt(stats.blocks);\n    (growMemViews(), HEAP64)[((buf + 16) >>> 3) >>> 0] = BigInt(stats.bfree);\n    (growMemViews(), HEAP64)[((buf + 24) >>> 3) >>> 0] = BigInt(stats.bavail);\n    (growMemViews(), HEAP64)[((buf + 32) >>> 3) >>> 0] = BigInt(stats.files);\n    (growMemViews(), HEAP64)[((buf + 40) >>> 3) >>> 0] = BigInt(stats.ffree);\n    (growMemViews(), HEAPU32)[((buf + 48) >>> 2) >>> 0] = stats.fsid;\n    (growMemViews(), HEAPU32)[((buf + 64) >>> 2) >>> 0] = stats.flags;\n    (growMemViews(), HEAPU32)[((buf + 56) >>> 2) >>> 0] = stats.namelen;\n  },\n  doMsync(addr, stream, len, flags, offset) {\n    if (!FS.isFile(stream.node.mode)) {\n      throw new FS.ErrnoError(43);\n    }\n    if (flags & 2) {\n      return 0;\n    }\n    var buffer = (growMemViews(), HEAPU8).slice(addr, addr + len);\n    FS.msync(stream, buffer, offset, len, flags);\n  },\n  getStreamFromFD(fd) {\n    var stream = FS.getStreamChecked(fd);\n    return stream;\n  },\n  varargs: undefined,\n  getStr(ptr) {\n    var ret = UTF8ToString(ptr);\n    return ret;\n  },\n};\nfunction ___syscall_fcntl64(fd, cmd, varargs) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(3, 0, 1, fd, cmd, varargs);\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    switch (cmd) {\n      case 0: {\n        var arg = syscallGetVarargI();\n        if (arg < 0) {\n          return -28;\n        }\n        while (FS.streams[arg]) {\n          arg++;\n        }\n        var newStream;\n        newStream = FS.dupStream(stream, arg);\n        return newStream.fd;\n      }\n      case 1:\n      case 2:\n        return 0;\n      case 3:\n        return stream.flags;\n      case 4: {\n        var arg = syscallGetVarargI();\n        stream.flags |= arg;\n        return 0;\n      }\n      case 12: {\n        var arg = syscallGetVarargP();\n        var offset = 0;\n        (growMemViews(), HEAP16)[((arg + offset) >>> 1) >>> 0] = 2;\n        return 0;\n      }\n      case 13:\n      case 14:\n        return 0;\n    }\n    return -28;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_fstat64(fd, buf) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(4, 0, 1, fd, buf);\n  buf >>>= 0;\n  try {\n    return SYSCALLS.writeStat(buf, FS.fstat(fd));\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar stringToUTF8 = (str, outPtr, maxBytesToWrite) =>\n  stringToUTF8Array(str, (growMemViews(), HEAPU8), outPtr, maxBytesToWrite);\nfunction ___syscall_getcwd(buf, size) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(5, 0, 1, buf, size);\n  buf >>>= 0;\n  size >>>= 0;\n  try {\n    if (size === 0) return -28;\n    var cwd = FS.cwd();\n    var cwdLengthInBytes = lengthBytesUTF8(cwd) + 1;\n    if (size < cwdLengthInBytes) return -68;\n    stringToUTF8(cwd, buf, size);\n    return cwdLengthInBytes;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_getdents64(fd, dirp, count) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(6, 0, 1, fd, dirp, count);\n  dirp >>>= 0;\n  count >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    stream.getdents ||= FS.readdir(stream.path);\n    var struct_size = 280;\n    var pos = 0;\n    var off = FS.llseek(stream, 0, 1);\n    var startIdx = Math.floor(off / struct_size);\n    var endIdx = Math.min(\n      stream.getdents.length,\n      startIdx + Math.floor(count / struct_size)\n    );\n    for (var idx = startIdx; idx < endIdx; idx++) {\n      var id;\n      var type;\n      var name = stream.getdents[idx];\n      if (name === '.') {\n        id = stream.node.id;\n        type = 4;\n      } else if (name === '..') {\n        var lookup = FS.lookupPath(stream.path, { parent: true });\n        id = lookup.node.id;\n        type = 4;\n      } else {\n        var child;\n        try {\n          child = FS.lookupNode(stream.node, name);\n        } catch (e) {\n          if (e?.errno === 28) {\n            continue;\n          }\n          throw e;\n        }\n        id = child.id;\n        type = FS.isChrdev(child.mode)\n          ? 2\n          : FS.isDir(child.mode)\n            ? 4\n            : FS.isLink(child.mode)\n              ? 10\n              : 8;\n      }\n      (growMemViews(), HEAP64)[((dirp + pos) >>> 3) >>> 0] = BigInt(id);\n      (growMemViews(), HEAP64)[((dirp + pos + 8) >>> 3) >>> 0] = BigInt(\n        (idx + 1) * struct_size\n      );\n      (growMemViews(), HEAP16)[((dirp + pos + 16) >>> 1) >>> 0] = 280;\n      (growMemViews(), HEAP8)[(dirp + pos + 18) >>> 0] = type;\n      stringToUTF8(name, dirp + pos + 19, 256);\n      pos += struct_size;\n    }\n    FS.llseek(stream, idx * struct_size, 0);\n    return pos;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_ioctl(fd, op, varargs) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(7, 0, 1, fd, op, varargs);\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    switch (op) {\n      case 21509: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21505: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tcgets) {\n          var termios = stream.tty.ops.ioctl_tcgets(stream);\n          var argp = syscallGetVarargP();\n          (growMemViews(), HEAP32)[(argp >>> 2) >>> 0] = termios.c_iflag || 0;\n          (growMemViews(), HEAP32)[((argp + 4) >>> 2) >>> 0] =\n            termios.c_oflag || 0;\n          (growMemViews(), HEAP32)[((argp + 8) >>> 2) >>> 0] =\n            termios.c_cflag || 0;\n          (growMemViews(), HEAP32)[((argp + 12) >>> 2) >>> 0] =\n            termios.c_lflag || 0;\n          for (var i = 0; i < 32; i++) {\n            (growMemViews(), HEAP8)[(argp + i + 17) >>> 0] =\n              termios.c_cc[i] || 0;\n          }\n          return 0;\n        }\n        return 0;\n      }\n      case 21510:\n      case 21511:\n      case 21512: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21506:\n      case 21507:\n      case 21508: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tcsets) {\n          var argp = syscallGetVarargP();\n          var c_iflag = (growMemViews(), HEAP32)[(argp >>> 2) >>> 0];\n          var c_oflag = (growMemViews(), HEAP32)[((argp + 4) >>> 2) >>> 0];\n          var c_cflag = (growMemViews(), HEAP32)[((argp + 8) >>> 2) >>> 0];\n          var c_lflag = (growMemViews(), HEAP32)[((argp + 12) >>> 2) >>> 0];\n          var c_cc = [];\n          for (var i = 0; i < 32; i++) {\n            c_cc.push((growMemViews(), HEAP8)[(argp + i + 17) >>> 0]);\n          }\n          return stream.tty.ops.ioctl_tcsets(stream.tty, op, {\n            c_iflag,\n            c_oflag,\n            c_cflag,\n            c_lflag,\n            c_cc,\n          });\n        }\n        return 0;\n      }\n      case 21519: {\n        if (!stream.tty) return -59;\n        var argp = syscallGetVarargP();\n        (growMemViews(), HEAP32)[(argp >>> 2) >>> 0] = 0;\n        return 0;\n      }\n      case 21520: {\n        if (!stream.tty) return -59;\n        return -28;\n      }\n      case 21537:\n      case 21531: {\n        var argp = syscallGetVarargP();\n        return FS.ioctl(stream, op, argp);\n      }\n      case 21523: {\n        if (!stream.tty) return -59;\n        if (stream.tty.ops.ioctl_tiocgwinsz) {\n          var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);\n          var argp = syscallGetVarargP();\n          (growMemViews(), HEAP16)[(argp >>> 1) >>> 0] = winsize[0];\n          (growMemViews(), HEAP16)[((argp + 2) >>> 1) >>> 0] = winsize[1];\n        }\n        return 0;\n      }\n      case 21524: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      case 21515: {\n        if (!stream.tty) return -59;\n        return 0;\n      }\n      default:\n        return -28;\n    }\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_lstat64(path, buf) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(8, 0, 1, path, buf);\n  path >>>= 0;\n  buf >>>= 0;\n  try {\n    path = SYSCALLS.getStr(path);\n    return SYSCALLS.writeStat(buf, FS.lstat(path));\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_newfstatat(dirfd, path, buf, flags) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(9, 0, 1, dirfd, path, buf, flags);\n  path >>>= 0;\n  buf >>>= 0;\n  try {\n    path = SYSCALLS.getStr(path);\n    var nofollow = flags & 256;\n    var allowEmpty = flags & 4096;\n    flags = flags & ~6400;\n    path = SYSCALLS.calculateAt(dirfd, path, allowEmpty);\n    return SYSCALLS.writeStat(buf, nofollow ? FS.lstat(path) : FS.stat(path));\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_openat(dirfd, path, flags, varargs) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(10, 0, 1, dirfd, path, flags, varargs);\n  path >>>= 0;\n  varargs >>>= 0;\n  SYSCALLS.varargs = varargs;\n  try {\n    path = SYSCALLS.getStr(path);\n    path = SYSCALLS.calculateAt(dirfd, path);\n    var mode = varargs ? syscallGetVarargI() : 0;\n    return FS.open(path, flags, mode).fd;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction ___syscall_stat64(path, buf) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(11, 0, 1, path, buf);\n  path >>>= 0;\n  buf >>>= 0;\n  try {\n    path = SYSCALLS.getStr(path);\n    return SYSCALLS.writeStat(buf, FS.stat(path));\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar __abort_js = () => abort('');\nfunction __emscripten_init_main_thread_js(tb) {\n  tb >>>= 0;\n  __emscripten_thread_init(\n    tb,\n    !ENVIRONMENT_IS_WORKER,\n    1,\n    !ENVIRONMENT_IS_WEB,\n    65536,\n    false\n  );\n  PThread.threadInitTLS();\n}\nvar handleException = (e) => {\n  if (e instanceof ExitStatus || e == 'unwind') {\n    return EXITSTATUS;\n  }\n  quit_(1, e);\n};\nvar maybeExit = () => {\n  if (!keepRuntimeAlive()) {\n    try {\n      if (ENVIRONMENT_IS_PTHREAD) {\n        if (_pthread_self()) __emscripten_thread_exit(EXITSTATUS);\n        return;\n      }\n      _exit(EXITSTATUS);\n    } catch (e) {\n      handleException(e);\n    }\n  }\n};\nvar callUserCallback = (func) => {\n  if (ABORT) {\n    return;\n  }\n  try {\n    func();\n    maybeExit();\n  } catch (e) {\n    handleException(e);\n  }\n};\nfunction __emscripten_thread_mailbox_await(pthread_ptr) {\n  pthread_ptr >>>= 0;\n  if (Atomics.waitAsync) {\n    var wait = Atomics.waitAsync(\n      (growMemViews(), HEAP32),\n      pthread_ptr >>> 2,\n      pthread_ptr\n    );\n    wait.value.then(checkMailbox);\n    var waitingAsync = pthread_ptr + 128;\n    Atomics.store((growMemViews(), HEAP32), waitingAsync >>> 2, 1);\n  }\n}\nvar checkMailbox = () =>\n  callUserCallback(() => {\n    var pthread_ptr = _pthread_self();\n    if (pthread_ptr) {\n      __emscripten_thread_mailbox_await(pthread_ptr);\n      __emscripten_check_mailbox();\n    }\n  });\nfunction __emscripten_notify_mailbox_postmessage(targetThread, currThreadId) {\n  targetThread >>>= 0;\n  currThreadId >>>= 0;\n  if (targetThread == currThreadId) {\n    setTimeout(checkMailbox);\n  } else if (ENVIRONMENT_IS_PTHREAD) {\n    postMessage({ targetThread, cmd: 'checkMailbox' });\n  } else {\n    var worker = PThread.pthreads[targetThread];\n    if (!worker) {\n      return;\n    }\n    worker.postMessage({ cmd: 'checkMailbox' });\n  }\n}\nvar proxiedJSCallArgs = [];\nfunction __emscripten_receive_on_main_thread_js(\n  funcIndex,\n  emAsmAddr,\n  callingThread,\n  numCallArgs,\n  args\n) {\n  emAsmAddr >>>= 0;\n  callingThread >>>= 0;\n  args >>>= 0;\n  numCallArgs /= 2;\n  proxiedJSCallArgs.length = numCallArgs;\n  var b = args >>> 3;\n  for (var i = 0; i < numCallArgs; i++) {\n    if ((growMemViews(), HEAP64)[(b + 2 * i) >>> 0]) {\n      proxiedJSCallArgs[i] = (growMemViews(), HEAP64)[(b + 2 * i + 1) >>> 0];\n    } else {\n      proxiedJSCallArgs[i] = (growMemViews(), HEAPF64)[(b + 2 * i + 1) >>> 0];\n    }\n  }\n  var func = proxiedFunctionTable[funcIndex];\n  PThread.currentProxiedOperationCallerThread = callingThread;\n  var rtn = func(...proxiedJSCallArgs);\n  PThread.currentProxiedOperationCallerThread = 0;\n  return rtn;\n}\nvar __emscripten_runtime_keepalive_clear = () => {\n  noExitRuntime = false;\n  runtimeKeepaliveCounter = 0;\n};\nfunction __emscripten_thread_cleanup(thread) {\n  thread >>>= 0;\n  if (!ENVIRONMENT_IS_PTHREAD) cleanupThread(thread);\n  else postMessage({ cmd: 'cleanupThread', thread });\n}\nfunction __emscripten_thread_set_strongref(thread) {\n  thread >>>= 0;\n  if (ENVIRONMENT_IS_NODE) {\n    PThread.pthreads[thread].ref();\n  }\n}\nfunction __mmap_js(len, prot, flags, fd, offset, allocated, addr) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(\n      12,\n      0,\n      1,\n      len,\n      prot,\n      flags,\n      fd,\n      offset,\n      allocated,\n      addr\n    );\n  len >>>= 0;\n  offset = bigintToI53Checked(offset);\n  allocated >>>= 0;\n  addr >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var res = FS.mmap(stream, len, offset, prot, flags);\n    var ptr = res.ptr;\n    (growMemViews(), HEAP32)[(allocated >>> 2) >>> 0] = res.allocated;\n    (growMemViews(), HEAPU32)[(addr >>> 2) >>> 0] = ptr;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nfunction __munmap_js(addr, len, prot, flags, fd, offset) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(13, 0, 1, addr, len, prot, flags, fd, offset);\n  addr >>>= 0;\n  len >>>= 0;\n  offset = bigintToI53Checked(offset);\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    if (prot & 2) {\n      SYSCALLS.doMsync(addr, stream, len, flags, offset);\n    }\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return -e.errno;\n  }\n}\nvar timers = {};\nvar _emscripten_get_now = () => performance.timeOrigin + performance.now();\nfunction __setitimer_js(which, timeout_ms) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(14, 0, 1, which, timeout_ms);\n  if (timers[which]) {\n    clearTimeout(timers[which].id);\n    delete timers[which];\n  }\n  if (!timeout_ms) return 0;\n  var id = setTimeout(() => {\n    delete timers[which];\n    callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));\n  }, timeout_ms);\n  timers[which] = { id, timeout_ms };\n  return 0;\n}\nvar __tzset_js = function (timezone, daylight, std_name, dst_name) {\n  timezone >>>= 0;\n  daylight >>>= 0;\n  std_name >>>= 0;\n  dst_name >>>= 0;\n  var currentYear = new Date().getFullYear();\n  var winter = new Date(currentYear, 0, 1);\n  var summer = new Date(currentYear, 6, 1);\n  var winterOffset = winter.getTimezoneOffset();\n  var summerOffset = summer.getTimezoneOffset();\n  var stdTimezoneOffset = Math.max(winterOffset, summerOffset);\n  (growMemViews(), HEAPU32)[(timezone >>> 2) >>> 0] = stdTimezoneOffset * 60;\n  (growMemViews(), HEAP32)[(daylight >>> 2) >>> 0] = Number(\n    winterOffset != summerOffset\n  );\n  var extractZone = (timezoneOffset) => {\n    var sign = timezoneOffset >= 0 ? '-' : '+';\n    var absOffset = Math.abs(timezoneOffset);\n    var hours = String(Math.floor(absOffset / 60)).padStart(2, '0');\n    var minutes = String(absOffset % 60).padStart(2, '0');\n    return `UTC${sign}${hours}${minutes}`;\n  };\n  var winterName = extractZone(winterOffset);\n  var summerName = extractZone(summerOffset);\n  if (summerOffset < winterOffset) {\n    stringToUTF8(winterName, std_name, 17);\n    stringToUTF8(summerName, dst_name, 17);\n  } else {\n    stringToUTF8(winterName, dst_name, 17);\n    stringToUTF8(summerName, std_name, 17);\n  }\n};\nvar _emscripten_date_now = () => Date.now();\nvar nowIsMonotonic = 1;\nvar checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;\nfunction _clock_time_get(clk_id, ignored_precision, ptime) {\n  ignored_precision = bigintToI53Checked(ignored_precision);\n  ptime >>>= 0;\n  if (!checkWasiClock(clk_id)) {\n    return 28;\n  }\n  var now;\n  if (clk_id === 0) {\n    now = _emscripten_date_now();\n  } else if (nowIsMonotonic) {\n    now = _emscripten_get_now();\n  } else {\n    return 52;\n  }\n  var nsec = Math.round(now * 1e3 * 1e3);\n  (growMemViews(), HEAP64)[(ptime >>> 3) >>> 0] = BigInt(nsec);\n  return 0;\n}\nvar _emscripten_check_blocking_allowed = () => {};\nvar runtimeKeepalivePush = () => {\n  runtimeKeepaliveCounter += 1;\n};\nvar _emscripten_exit_with_live_runtime = () => {\n  runtimeKeepalivePush();\n  throw 'unwind';\n};\nvar getHeapMax = () => 4294901760;\nfunction _emscripten_get_heap_max() {\n  return getHeapMax();\n}\nvar _emscripten_has_asyncify = () => 1;\nvar _emscripten_num_logical_cores = () =>\n  ENVIRONMENT_IS_NODE\n    ? require('os').cpus().length\n    : navigator['hardwareConcurrency'];\nvar growMemory = (size) => {\n  var oldHeapSize = wasmMemory.buffer.byteLength;\n  var pages = ((size - oldHeapSize + 65535) / 65536) | 0;\n  try {\n    wasmMemory.grow(pages);\n    updateMemoryViews();\n    return 1;\n  } catch (e) {}\n};\nfunction _emscripten_resize_heap(requestedSize) {\n  requestedSize >>>= 0;\n  var oldSize = (growMemViews(), HEAPU8).length;\n  if (requestedSize <= oldSize) {\n    return false;\n  }\n  var maxHeapSize = getHeapMax();\n  if (requestedSize > maxHeapSize) {\n    return false;\n  }\n  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {\n    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);\n    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);\n    var newSize = Math.min(\n      maxHeapSize,\n      alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536)\n    );\n    var replacement = growMemory(newSize);\n    if (replacement) {\n      return true;\n    }\n  }\n  return false;\n}\nvar stringToUTF8OnStack = (str) => {\n  var size = lengthBytesUTF8(str) + 1;\n  var ret = stackAlloc(size);\n  stringToUTF8(str, ret, size);\n  return ret;\n};\nvar writeI53ToI64 = (ptr, num) => {\n  (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0] = num;\n  var lower = (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0];\n  (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0] =\n    (num - lower) / 4294967296;\n};\nvar stringToNewUTF8 = (str) => {\n  var size = lengthBytesUTF8(str) + 1;\n  var ret = _malloc(size);\n  if (ret) stringToUTF8(str, ret, size);\n  return ret;\n};\nvar readI53FromI64 = (ptr) =>\n  (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0] +\n  (growMemViews(), HEAP32)[((ptr + 4) >>> 2) >>> 0] * 4294967296;\nvar WebGPU = {\n  Internals: {\n    jsObjects: [],\n    jsObjectInsert: (ptr, jsObject) => {\n      ptr >>>= 0;\n      WebGPU.Internals.jsObjects[ptr] = jsObject;\n    },\n    bufferOnUnmaps: [],\n    futures: [],\n    futureInsert: (futureId, promise) => {\n      WebGPU.Internals.futures[futureId] = new Promise((resolve) =>\n        promise.finally(() => resolve(futureId))\n      );\n    },\n  },\n  getJsObject: (ptr) => {\n    if (!ptr) return undefined;\n    ptr >>>= 0;\n    return WebGPU.Internals.jsObjects[ptr];\n  },\n  importJsAdapter: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateAdapter(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBindGroup: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateBindGroup(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBindGroupLayout: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateBindGroupLayout(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsBuffer: (buffer, parentPtr = 0) => {\n    assert(buffer.mapState === 'unmapped');\n    var bufferPtr = _emwgpuCreateBuffer(parentPtr);\n    WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);\n    return bufferPtr;\n  },\n  importJsCommandBuffer: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateCommandBuffer(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsCommandEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateCommandEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsComputePassEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateComputePassEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsComputePipeline: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateComputePipeline(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsDevice: (device, parentPtr = 0) => {\n    var queuePtr = _emwgpuCreateQueue(parentPtr);\n    var devicePtr = _emwgpuCreateDevice(parentPtr, queuePtr);\n    WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);\n    WebGPU.Internals.jsObjectInsert(devicePtr, device);\n    return devicePtr;\n  },\n  importJsExternalTexture: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateExternalTexture(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsPipelineLayout: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreatePipelineLayout(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsQuerySet: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateQuerySet(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsQueue: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateQueue(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderBundle: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderBundle(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderBundleEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderBundleEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderPassEncoder: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderPassEncoder(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsRenderPipeline: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateRenderPipeline(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsSampler: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateSampler(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsShaderModule: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateShaderModule(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsSurface: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateSurface(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsTexture: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateTexture(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  importJsTextureView: (obj, parentPtr = 0) => {\n    var ptr = _emwgpuCreateTextureView(parentPtr);\n    WebGPU.Internals.jsObjects[ptr] = obj;\n    return ptr;\n  },\n  errorCallback: (callback, type, message, userdata) => {\n    var sp = stackSave();\n    var messagePtr = stringToUTF8OnStack(message);\n    ((a1, a2, a3) => dynCall_viii(callback, a1, a2, a3))(\n      type,\n      messagePtr,\n      userdata\n    );\n    stackRestore(sp);\n  },\n  iterateExtensions: (root, handlers) => {\n    for (\n      var ptr = (growMemViews(), HEAPU32)[(root >>> 2) >>> 0];\n      ptr;\n      ptr = (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0]\n    ) {\n      var sType = (growMemViews(), HEAP32)[((ptr + 4) >>> 2) >>> 0];\n      var handler = handlers[sType](ptr);\n    }\n  },\n  setStringView: (ptr, data, length) => {\n    (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0] = data;\n    (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0] = length;\n  },\n  makeStringFromStringView: (stringViewPtr) => {\n    var ptr = (growMemViews(), HEAPU32)[(stringViewPtr >>> 2) >>> 0];\n    var length = (growMemViews(), HEAPU32)[((stringViewPtr + 4) >>> 2) >>> 0];\n    return UTF8ToString(ptr, length);\n  },\n  makeStringFromOptionalStringView: (stringViewPtr) => {\n    var ptr = (growMemViews(), HEAPU32)[(stringViewPtr >>> 2) >>> 0];\n    var length = (growMemViews(), HEAPU32)[((stringViewPtr + 4) >>> 2) >>> 0];\n    if (!ptr) {\n      if (length === 0) {\n        return '';\n      }\n      return undefined;\n    }\n    return UTF8ToString(ptr, length);\n  },\n  makeColor: (ptr) => ({\n    r: (growMemViews(), HEAPF64)[(ptr >>> 3) >>> 0],\n    g: (growMemViews(), HEAPF64)[((ptr + 8) >>> 3) >>> 0],\n    b: (growMemViews(), HEAPF64)[((ptr + 16) >>> 3) >>> 0],\n    a: (growMemViews(), HEAPF64)[((ptr + 24) >>> 3) >>> 0],\n  }),\n  makeExtent3D: (ptr) => ({\n    width: (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0],\n    height: (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0],\n    depthOrArrayLayers: (growMemViews(), HEAPU32)[((ptr + 8) >>> 2) >>> 0],\n  }),\n  makeOrigin3D: (ptr) => ({\n    x: (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0],\n    y: (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0],\n    z: (growMemViews(), HEAPU32)[((ptr + 8) >>> 2) >>> 0],\n  }),\n  makeTexelCopyTextureInfo: (ptr) => ({\n    texture: WebGPU.getJsObject((growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0]),\n    mipLevel: (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0],\n    origin: WebGPU.makeOrigin3D(ptr + 8),\n    aspect:\n      WebGPU.TextureAspect[(growMemViews(), HEAP32)[((ptr + 20) >>> 2) >>> 0]],\n  }),\n  makeTexelCopyBufferLayout: (ptr) => {\n    var bytesPerRow = (growMemViews(), HEAPU32)[((ptr + 8) >>> 2) >>> 0];\n    var rowsPerImage = (growMemViews(), HEAPU32)[((ptr + 12) >>> 2) >>> 0];\n    return {\n      offset: readI53FromI64(ptr),\n      bytesPerRow: bytesPerRow === 4294967295 ? undefined : bytesPerRow,\n      rowsPerImage: rowsPerImage === 4294967295 ? undefined : rowsPerImage,\n    };\n  },\n  makeTexelCopyBufferInfo: (ptr) => {\n    var layoutPtr = ptr + 0;\n    var bufferCopyView = WebGPU.makeTexelCopyBufferLayout(layoutPtr);\n    bufferCopyView['buffer'] = WebGPU.getJsObject(\n      (growMemViews(), HEAPU32)[((ptr + 16) >>> 2) >>> 0]\n    );\n    return bufferCopyView;\n  },\n  makePassTimestampWrites: (ptr) => {\n    if (ptr === 0) return undefined;\n    return {\n      querySet: WebGPU.getJsObject(\n        (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0]\n      ),\n      beginningOfPassWriteIndex: (growMemViews(), HEAPU32)[\n        ((ptr + 8) >>> 2) >>> 0\n      ],\n      endOfPassWriteIndex: (growMemViews(), HEAPU32)[((ptr + 12) >>> 2) >>> 0],\n    };\n  },\n  makePipelineConstants: (constantCount, constantsPtr) => {\n    if (!constantCount) return;\n    var constants = {};\n    for (var i = 0; i < constantCount; ++i) {\n      var entryPtr = constantsPtr + 24 * i;\n      var key = WebGPU.makeStringFromStringView(entryPtr + 4);\n      constants[key] = (growMemViews(), HEAPF64)[((entryPtr + 16) >>> 3) >>> 0];\n    }\n    return constants;\n  },\n  makePipelineLayout: (layoutPtr) => {\n    if (!layoutPtr) return 'auto';\n    return WebGPU.getJsObject(layoutPtr);\n  },\n  makeComputeState: (ptr) => {\n    if (!ptr) return undefined;\n    var desc = {\n      module: WebGPU.getJsObject(\n        (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0]\n      ),\n      constants: WebGPU.makePipelineConstants(\n        (growMemViews(), HEAPU32)[((ptr + 16) >>> 2) >>> 0],\n        (growMemViews(), HEAPU32)[((ptr + 20) >>> 2) >>> 0]\n      ),\n      entryPoint: WebGPU.makeStringFromOptionalStringView(ptr + 8),\n    };\n    return desc;\n  },\n  makeComputePipelineDesc: (descriptor) => {\n    var desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      layout: WebGPU.makePipelineLayout(\n        (growMemViews(), HEAPU32)[((descriptor + 12) >>> 2) >>> 0]\n      ),\n      compute: WebGPU.makeComputeState(descriptor + 16),\n    };\n    return desc;\n  },\n  makeRenderPipelineDesc: (descriptor) => {\n    function makePrimitiveState(psPtr) {\n      if (!psPtr) return undefined;\n      return {\n        topology:\n          WebGPU.PrimitiveTopology[\n            (growMemViews(), HEAP32)[((psPtr + 4) >>> 2) >>> 0]\n          ],\n        stripIndexFormat:\n          WebGPU.IndexFormat[\n            (growMemViews(), HEAP32)[((psPtr + 8) >>> 2) >>> 0]\n          ],\n        frontFace:\n          WebGPU.FrontFace[\n            (growMemViews(), HEAP32)[((psPtr + 12) >>> 2) >>> 0]\n          ],\n        cullMode:\n          WebGPU.CullMode[(growMemViews(), HEAP32)[((psPtr + 16) >>> 2) >>> 0]],\n        unclippedDepth: !!(growMemViews(), HEAPU32)[((psPtr + 20) >>> 2) >>> 0],\n      };\n    }\n    function makeBlendComponent(bdPtr) {\n      if (!bdPtr) return undefined;\n      return {\n        operation:\n          WebGPU.BlendOperation[(growMemViews(), HEAP32)[(bdPtr >>> 2) >>> 0]],\n        srcFactor:\n          WebGPU.BlendFactor[\n            (growMemViews(), HEAP32)[((bdPtr + 4) >>> 2) >>> 0]\n          ],\n        dstFactor:\n          WebGPU.BlendFactor[\n            (growMemViews(), HEAP32)[((bdPtr + 8) >>> 2) >>> 0]\n          ],\n      };\n    }\n    function makeBlendState(bsPtr) {\n      if (!bsPtr) return undefined;\n      return {\n        alpha: makeBlendComponent(bsPtr + 12),\n        color: makeBlendComponent(bsPtr + 0),\n      };\n    }\n    function makeColorState(csPtr) {\n      var format =\n        WebGPU.TextureFormat[\n          (growMemViews(), HEAP32)[((csPtr + 4) >>> 2) >>> 0]\n        ];\n      return format\n        ? {\n            format,\n            blend: makeBlendState(\n              (growMemViews(), HEAPU32)[((csPtr + 8) >>> 2) >>> 0]\n            ),\n            writeMask: (growMemViews(), HEAPU32)[((csPtr + 16) >>> 2) >>> 0],\n          }\n        : undefined;\n    }\n    function makeColorStates(count, csArrayPtr) {\n      var states = [];\n      for (var i = 0; i < count; ++i) {\n        states.push(makeColorState(csArrayPtr + 24 * i));\n      }\n      return states;\n    }\n    function makeStencilStateFace(ssfPtr) {\n      return {\n        compare:\n          WebGPU.CompareFunction[\n            (growMemViews(), HEAP32)[(ssfPtr >>> 2) >>> 0]\n          ],\n        failOp:\n          WebGPU.StencilOperation[\n            (growMemViews(), HEAP32)[((ssfPtr + 4) >>> 2) >>> 0]\n          ],\n        depthFailOp:\n          WebGPU.StencilOperation[\n            (growMemViews(), HEAP32)[((ssfPtr + 8) >>> 2) >>> 0]\n          ],\n        passOp:\n          WebGPU.StencilOperation[\n            (growMemViews(), HEAP32)[((ssfPtr + 12) >>> 2) >>> 0]\n          ],\n      };\n    }\n    function makeDepthStencilState(dssPtr) {\n      if (!dssPtr) return undefined;\n      return {\n        format:\n          WebGPU.TextureFormat[\n            (growMemViews(), HEAP32)[((dssPtr + 4) >>> 2) >>> 0]\n          ],\n        depthWriteEnabled: !!(growMemViews(), HEAPU32)[\n          ((dssPtr + 8) >>> 2) >>> 0\n        ],\n        depthCompare:\n          WebGPU.CompareFunction[\n            (growMemViews(), HEAP32)[((dssPtr + 12) >>> 2) >>> 0]\n          ],\n        stencilFront: makeStencilStateFace(dssPtr + 16),\n        stencilBack: makeStencilStateFace(dssPtr + 32),\n        stencilReadMask: (growMemViews(), HEAPU32)[((dssPtr + 48) >>> 2) >>> 0],\n        stencilWriteMask: (growMemViews(), HEAPU32)[\n          ((dssPtr + 52) >>> 2) >>> 0\n        ],\n        depthBias: (growMemViews(), HEAP32)[((dssPtr + 56) >>> 2) >>> 0],\n        depthBiasSlopeScale: (growMemViews(), HEAPF32)[\n          ((dssPtr + 60) >>> 2) >>> 0\n        ],\n        depthBiasClamp: (growMemViews(), HEAPF32)[((dssPtr + 64) >>> 2) >>> 0],\n      };\n    }\n    function makeVertexAttribute(vaPtr) {\n      return {\n        format:\n          WebGPU.VertexFormat[\n            (growMemViews(), HEAP32)[((vaPtr + 4) >>> 2) >>> 0]\n          ],\n        offset: readI53FromI64(vaPtr + 8),\n        shaderLocation: (growMemViews(), HEAPU32)[((vaPtr + 16) >>> 2) >>> 0],\n      };\n    }\n    function makeVertexAttributes(count, vaArrayPtr) {\n      var vas = [];\n      for (var i = 0; i < count; ++i) {\n        vas.push(makeVertexAttribute(vaArrayPtr + i * 24));\n      }\n      return vas;\n    }\n    function makeVertexBuffer(vbPtr) {\n      if (!vbPtr) return undefined;\n      var stepMode =\n        WebGPU.VertexStepMode[\n          (growMemViews(), HEAP32)[((vbPtr + 4) >>> 2) >>> 0]\n        ];\n      var attributeCount = (growMemViews(), HEAPU32)[\n        ((vbPtr + 16) >>> 2) >>> 0\n      ];\n      if (!stepMode && !attributeCount) {\n        return null;\n      }\n      return {\n        arrayStride: readI53FromI64(vbPtr + 8),\n        stepMode,\n        attributes: makeVertexAttributes(\n          attributeCount,\n          (growMemViews(), HEAPU32)[((vbPtr + 20) >>> 2) >>> 0]\n        ),\n      };\n    }\n    function makeVertexBuffers(count, vbArrayPtr) {\n      if (!count) return undefined;\n      var vbs = [];\n      for (var i = 0; i < count; ++i) {\n        vbs.push(makeVertexBuffer(vbArrayPtr + i * 24));\n      }\n      return vbs;\n    }\n    function makeVertexState(viPtr) {\n      if (!viPtr) return undefined;\n      var desc = {\n        module: WebGPU.getJsObject(\n          (growMemViews(), HEAPU32)[((viPtr + 4) >>> 2) >>> 0]\n        ),\n        constants: WebGPU.makePipelineConstants(\n          (growMemViews(), HEAPU32)[((viPtr + 16) >>> 2) >>> 0],\n          (growMemViews(), HEAPU32)[((viPtr + 20) >>> 2) >>> 0]\n        ),\n        buffers: makeVertexBuffers(\n          (growMemViews(), HEAPU32)[((viPtr + 24) >>> 2) >>> 0],\n          (growMemViews(), HEAPU32)[((viPtr + 28) >>> 2) >>> 0]\n        ),\n        entryPoint: WebGPU.makeStringFromOptionalStringView(viPtr + 8),\n      };\n      return desc;\n    }\n    function makeMultisampleState(msPtr) {\n      if (!msPtr) return undefined;\n      return {\n        count: (growMemViews(), HEAPU32)[((msPtr + 4) >>> 2) >>> 0],\n        mask: (growMemViews(), HEAPU32)[((msPtr + 8) >>> 2) >>> 0],\n        alphaToCoverageEnabled: !!(growMemViews(), HEAPU32)[\n          ((msPtr + 12) >>> 2) >>> 0\n        ],\n      };\n    }\n    function makeFragmentState(fsPtr) {\n      if (!fsPtr) return undefined;\n      var desc = {\n        module: WebGPU.getJsObject(\n          (growMemViews(), HEAPU32)[((fsPtr + 4) >>> 2) >>> 0]\n        ),\n        constants: WebGPU.makePipelineConstants(\n          (growMemViews(), HEAPU32)[((fsPtr + 16) >>> 2) >>> 0],\n          (growMemViews(), HEAPU32)[((fsPtr + 20) >>> 2) >>> 0]\n        ),\n        targets: makeColorStates(\n          (growMemViews(), HEAPU32)[((fsPtr + 24) >>> 2) >>> 0],\n          (growMemViews(), HEAPU32)[((fsPtr + 28) >>> 2) >>> 0]\n        ),\n        entryPoint: WebGPU.makeStringFromOptionalStringView(fsPtr + 8),\n      };\n      return desc;\n    }\n    var desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      layout: WebGPU.makePipelineLayout(\n        (growMemViews(), HEAPU32)[((descriptor + 12) >>> 2) >>> 0]\n      ),\n      vertex: makeVertexState(descriptor + 16),\n      primitive: makePrimitiveState(descriptor + 48),\n      depthStencil: makeDepthStencilState(\n        (growMemViews(), HEAPU32)[((descriptor + 72) >>> 2) >>> 0]\n      ),\n      multisample: makeMultisampleState(descriptor + 76),\n      fragment: makeFragmentState(\n        (growMemViews(), HEAPU32)[((descriptor + 92) >>> 2) >>> 0]\n      ),\n    };\n    return desc;\n  },\n  fillLimitStruct: (limits, limitsOutPtr) => {\n    var nextInChainPtr = (growMemViews(), HEAPU32)[(limitsOutPtr >>> 2) >>> 0];\n    function setLimitValueU32(name, basePtr, limitOffset, fallbackValue = 0) {\n      var limitValue = limits[name] ?? fallbackValue;\n      (growMemViews(), HEAPU32)[((basePtr + limitOffset) >>> 2) >>> 0] =\n        limitValue;\n    }\n    function setLimitValueU64(name, basePtr, limitOffset, fallbackValue = 0) {\n      var limitValue = limits[name] ?? fallbackValue;\n      writeI53ToI64(basePtr + limitOffset, limitValue);\n    }\n    setLimitValueU32('maxTextureDimension1D', limitsOutPtr, 4);\n    setLimitValueU32('maxTextureDimension2D', limitsOutPtr, 8);\n    setLimitValueU32('maxTextureDimension3D', limitsOutPtr, 12);\n    setLimitValueU32('maxTextureArrayLayers', limitsOutPtr, 16);\n    setLimitValueU32('maxBindGroups', limitsOutPtr, 20);\n    setLimitValueU32('maxBindGroupsPlusVertexBuffers', limitsOutPtr, 24);\n    setLimitValueU32('maxBindingsPerBindGroup', limitsOutPtr, 28);\n    setLimitValueU32(\n      'maxDynamicUniformBuffersPerPipelineLayout',\n      limitsOutPtr,\n      32\n    );\n    setLimitValueU32(\n      'maxDynamicStorageBuffersPerPipelineLayout',\n      limitsOutPtr,\n      36\n    );\n    setLimitValueU32('maxSampledTexturesPerShaderStage', limitsOutPtr, 40);\n    setLimitValueU32('maxSamplersPerShaderStage', limitsOutPtr, 44);\n    setLimitValueU32('maxStorageBuffersPerShaderStage', limitsOutPtr, 48);\n    setLimitValueU32('maxStorageTexturesPerShaderStage', limitsOutPtr, 52);\n    setLimitValueU32('maxUniformBuffersPerShaderStage', limitsOutPtr, 56);\n    setLimitValueU32('minUniformBufferOffsetAlignment', limitsOutPtr, 80);\n    setLimitValueU32('minStorageBufferOffsetAlignment', limitsOutPtr, 84);\n    setLimitValueU64('maxUniformBufferBindingSize', limitsOutPtr, 64);\n    setLimitValueU64('maxStorageBufferBindingSize', limitsOutPtr, 72);\n    setLimitValueU32('maxVertexBuffers', limitsOutPtr, 88);\n    setLimitValueU64('maxBufferSize', limitsOutPtr, 96);\n    setLimitValueU32('maxVertexAttributes', limitsOutPtr, 104);\n    setLimitValueU32('maxVertexBufferArrayStride', limitsOutPtr, 108);\n    setLimitValueU32('maxInterStageShaderVariables', limitsOutPtr, 112);\n    setLimitValueU32('maxColorAttachments', limitsOutPtr, 116);\n    setLimitValueU32('maxColorAttachmentBytesPerSample', limitsOutPtr, 120);\n    setLimitValueU32('maxComputeWorkgroupStorageSize', limitsOutPtr, 124);\n    setLimitValueU32('maxComputeInvocationsPerWorkgroup', limitsOutPtr, 128);\n    setLimitValueU32('maxComputeWorkgroupSizeX', limitsOutPtr, 132);\n    setLimitValueU32('maxComputeWorkgroupSizeY', limitsOutPtr, 136);\n    setLimitValueU32('maxComputeWorkgroupSizeZ', limitsOutPtr, 140);\n    setLimitValueU32('maxComputeWorkgroupsPerDimension', limitsOutPtr, 144);\n    setLimitValueU32('maxImmediateSize', limitsOutPtr, 148);\n    if (nextInChainPtr !== 0) {\n      var sType = (growMemViews(), HEAP32)[((nextInChainPtr + 4) >>> 2) >>> 0];\n      var compatibilityModeLimitsPtr = nextInChainPtr;\n      setLimitValueU32(\n        'maxStorageBuffersInVertexStage',\n        compatibilityModeLimitsPtr,\n        8,\n        limits.maxStorageBuffersPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageBuffersInFragmentStage',\n        compatibilityModeLimitsPtr,\n        16,\n        limits.maxStorageBuffersPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageTexturesInVertexStage',\n        compatibilityModeLimitsPtr,\n        12,\n        limits.maxStorageTexturesPerShaderStage\n      );\n      setLimitValueU32(\n        'maxStorageTexturesInFragmentStage',\n        compatibilityModeLimitsPtr,\n        20,\n        limits.maxStorageTexturesPerShaderStage\n      );\n    }\n  },\n  fillAdapterInfoStruct: (info, infoStruct) => {\n    (growMemViews(), HEAPU32)[((infoStruct + 52) >>> 2) >>> 0] =\n      info.subgroupMinSize;\n    (growMemViews(), HEAPU32)[((infoStruct + 56) >>> 2) >>> 0] =\n      info.subgroupMaxSize;\n    var strs = info.vendor + info.architecture + info.device + info.description;\n    var strPtr = stringToNewUTF8(strs);\n    var vendorLen = lengthBytesUTF8(info.vendor);\n    WebGPU.setStringView(infoStruct + 4, strPtr, vendorLen);\n    strPtr += vendorLen;\n    var architectureLen = lengthBytesUTF8(info.architecture);\n    WebGPU.setStringView(infoStruct + 12, strPtr, architectureLen);\n    strPtr += architectureLen;\n    var deviceLen = lengthBytesUTF8(info.device);\n    WebGPU.setStringView(infoStruct + 20, strPtr, deviceLen);\n    strPtr += deviceLen;\n    var descriptionLen = lengthBytesUTF8(info.description);\n    WebGPU.setStringView(infoStruct + 28, strPtr, descriptionLen);\n    strPtr += descriptionLen;\n    (growMemViews(), HEAP32)[((infoStruct + 36) >>> 2) >>> 0] = 2;\n    var adapterType = info.isFallbackAdapter ? 3 : 4;\n    (growMemViews(), HEAP32)[((infoStruct + 40) >>> 2) >>> 0] = adapterType;\n    (growMemViews(), HEAPU32)[((infoStruct + 44) >>> 2) >>> 0] = 0;\n    (growMemViews(), HEAPU32)[((infoStruct + 48) >>> 2) >>> 0] = 0;\n  },\n  AddressMode: [, 'clamp-to-edge', 'repeat', 'mirror-repeat'],\n  BlendFactor: [\n    ,\n    'zero',\n    'one',\n    'src',\n    'one-minus-src',\n    'src-alpha',\n    'one-minus-src-alpha',\n    'dst',\n    'one-minus-dst',\n    'dst-alpha',\n    'one-minus-dst-alpha',\n    'src-alpha-saturated',\n    'constant',\n    'one-minus-constant',\n    'src1',\n    'one-minus-src1',\n    'src1-alpha',\n    'one-minus-src1-alpha',\n  ],\n  BlendOperation: [, 'add', 'subtract', 'reverse-subtract', 'min', 'max'],\n  BufferBindingType: [, , 'uniform', 'storage', 'read-only-storage'],\n  BufferMapState: [, 'unmapped', 'pending', 'mapped'],\n  CompareFunction: [\n    ,\n    'never',\n    'less',\n    'equal',\n    'less-equal',\n    'greater',\n    'not-equal',\n    'greater-equal',\n    'always',\n  ],\n  CompilationInfoRequestStatus: [, 'success', 'callback-cancelled'],\n  ComponentSwizzle: [, '0', '1', 'r', 'g', 'b', 'a'],\n  CompositeAlphaMode: [\n    ,\n    'opaque',\n    'premultiplied',\n    'unpremultiplied',\n    'inherit',\n  ],\n  CullMode: [, 'none', 'front', 'back'],\n  ErrorFilter: [, 'validation', 'out-of-memory', 'internal'],\n  FeatureLevel: [, 'compatibility', 'core'],\n  FeatureName: {\n    1: 'core-features-and-limits',\n    2: 'depth-clip-control',\n    3: 'depth32float-stencil8',\n    4: 'texture-compression-bc',\n    5: 'texture-compression-bc-sliced-3d',\n    6: 'texture-compression-etc2',\n    7: 'texture-compression-astc',\n    8: 'texture-compression-astc-sliced-3d',\n    9: 'timestamp-query',\n    10: 'indirect-first-instance',\n    11: 'shader-f16',\n    12: 'rg11b10ufloat-renderable',\n    13: 'bgra8unorm-storage',\n    14: 'float32-filterable',\n    15: 'float32-blendable',\n    16: 'clip-distances',\n    17: 'dual-source-blending',\n    18: 'subgroups',\n    19: 'texture-formats-tier1',\n    20: 'texture-formats-tier2',\n    21: 'primitive-index',\n    22: 'texture-component-swizzle',\n    327692: 'chromium-experimental-unorm16-texture-formats',\n    327729: 'chromium-experimental-multi-draw-indirect',\n  },\n  FilterMode: [, 'nearest', 'linear'],\n  FrontFace: [, 'ccw', 'cw'],\n  IndexFormat: [, 'uint16', 'uint32'],\n  InstanceFeatureName: [\n    ,\n    'timed-wait-any',\n    'shader-source-spirv',\n    'multiple-devices-per-adapter',\n  ],\n  LoadOp: [, 'load', 'clear'],\n  MipmapFilterMode: [, 'nearest', 'linear'],\n  OptionalBool: ['false', 'true'],\n  PowerPreference: [, 'low-power', 'high-performance'],\n  PredefinedColorSpace: [, 'srgb', 'display-p3'],\n  PrimitiveTopology: [\n    ,\n    'point-list',\n    'line-list',\n    'line-strip',\n    'triangle-list',\n    'triangle-strip',\n  ],\n  QueryType: [, 'occlusion', 'timestamp'],\n  SamplerBindingType: [, , 'filtering', 'non-filtering', 'comparison'],\n  Status: [, 'success', 'error'],\n  StencilOperation: [\n    ,\n    'keep',\n    'zero',\n    'replace',\n    'invert',\n    'increment-clamp',\n    'decrement-clamp',\n    'increment-wrap',\n    'decrement-wrap',\n  ],\n  StorageTextureAccess: [, , 'write-only', 'read-only', 'read-write'],\n  StoreOp: [, 'store', 'discard'],\n  SurfaceGetCurrentTextureStatus: [\n    ,\n    'success-optimal',\n    'success-suboptimal',\n    'timeout',\n    'outdated',\n    'lost',\n    'error',\n  ],\n  TextureAspect: [, 'all', 'stencil-only', 'depth-only'],\n  TextureDimension: [, '1d', '2d', '3d'],\n  TextureFormat: [\n    ,\n    'r8unorm',\n    'r8snorm',\n    'r8uint',\n    'r8sint',\n    'r16unorm',\n    'r16snorm',\n    'r16uint',\n    'r16sint',\n    'r16float',\n    'rg8unorm',\n    'rg8snorm',\n    'rg8uint',\n    'rg8sint',\n    'r32float',\n    'r32uint',\n    'r32sint',\n    'rg16unorm',\n    'rg16snorm',\n    'rg16uint',\n    'rg16sint',\n    'rg16float',\n    'rgba8unorm',\n    'rgba8unorm-srgb',\n    'rgba8snorm',\n    'rgba8uint',\n    'rgba8sint',\n    'bgra8unorm',\n    'bgra8unorm-srgb',\n    'rgb10a2uint',\n    'rgb10a2unorm',\n    'rg11b10ufloat',\n    'rgb9e5ufloat',\n    'rg32float',\n    'rg32uint',\n    'rg32sint',\n    'rgba16unorm',\n    'rgba16snorm',\n    'rgba16uint',\n    'rgba16sint',\n    'rgba16float',\n    'rgba32float',\n    'rgba32uint',\n    'rgba32sint',\n    'stencil8',\n    'depth16unorm',\n    'depth24plus',\n    'depth24plus-stencil8',\n    'depth32float',\n    'depth32float-stencil8',\n    'bc1-rgba-unorm',\n    'bc1-rgba-unorm-srgb',\n    'bc2-rgba-unorm',\n    'bc2-rgba-unorm-srgb',\n    'bc3-rgba-unorm',\n    'bc3-rgba-unorm-srgb',\n    'bc4-r-unorm',\n    'bc4-r-snorm',\n    'bc5-rg-unorm',\n    'bc5-rg-snorm',\n    'bc6h-rgb-ufloat',\n    'bc6h-rgb-float',\n    'bc7-rgba-unorm',\n    'bc7-rgba-unorm-srgb',\n    'etc2-rgb8unorm',\n    'etc2-rgb8unorm-srgb',\n    'etc2-rgb8a1unorm',\n    'etc2-rgb8a1unorm-srgb',\n    'etc2-rgba8unorm',\n    'etc2-rgba8unorm-srgb',\n    'eac-r11unorm',\n    'eac-r11snorm',\n    'eac-rg11unorm',\n    'eac-rg11snorm',\n    'astc-4x4-unorm',\n    'astc-4x4-unorm-srgb',\n    'astc-5x4-unorm',\n    'astc-5x4-unorm-srgb',\n    'astc-5x5-unorm',\n    'astc-5x5-unorm-srgb',\n    'astc-6x5-unorm',\n    'astc-6x5-unorm-srgb',\n    'astc-6x6-unorm',\n    'astc-6x6-unorm-srgb',\n    'astc-8x5-unorm',\n    'astc-8x5-unorm-srgb',\n    'astc-8x6-unorm',\n    'astc-8x6-unorm-srgb',\n    'astc-8x8-unorm',\n    'astc-8x8-unorm-srgb',\n    'astc-10x5-unorm',\n    'astc-10x5-unorm-srgb',\n    'astc-10x6-unorm',\n    'astc-10x6-unorm-srgb',\n    'astc-10x8-unorm',\n    'astc-10x8-unorm-srgb',\n    'astc-10x10-unorm',\n    'astc-10x10-unorm-srgb',\n    'astc-12x10-unorm',\n    'astc-12x10-unorm-srgb',\n    'astc-12x12-unorm',\n    'astc-12x12-unorm-srgb',\n  ],\n  TextureSampleType: [\n    ,\n    ,\n    'float',\n    'unfilterable-float',\n    'depth',\n    'sint',\n    'uint',\n  ],\n  TextureViewDimension: [, '1d', '2d', '2d-array', 'cube', 'cube-array', '3d'],\n  ToneMappingMode: [, 'standard', 'extended'],\n  VertexFormat: [\n    ,\n    'uint8',\n    'uint8x2',\n    'uint8x4',\n    'sint8',\n    'sint8x2',\n    'sint8x4',\n    'unorm8',\n    'unorm8x2',\n    'unorm8x4',\n    'snorm8',\n    'snorm8x2',\n    'snorm8x4',\n    'uint16',\n    'uint16x2',\n    'uint16x4',\n    'sint16',\n    'sint16x2',\n    'sint16x4',\n    'unorm16',\n    'unorm16x2',\n    'unorm16x4',\n    'snorm16',\n    'snorm16x2',\n    'snorm16x4',\n    'float16',\n    'float16x2',\n    'float16x4',\n    'float32',\n    'float32x2',\n    'float32x3',\n    'float32x4',\n    'uint32',\n    'uint32x2',\n    'uint32x3',\n    'uint32x4',\n    'sint32',\n    'sint32x2',\n    'sint32x3',\n    'sint32x4',\n    'unorm10-10-10-2',\n    'unorm8x4-bgra',\n  ],\n  VertexStepMode: [, 'vertex', 'instance'],\n  WGSLLanguageFeatureName: [\n    ,\n    'readonly_and_readwrite_storage_textures',\n    'packed_4x8_integer_dot_product',\n    'unrestricted_pointer_parameters',\n    'pointer_composite_access',\n    'uniform_buffer_standard_layout',\n    'subgroup_id',\n    'texture_and_sampler_let',\n    'subgroup_uniformity',\n    'texture_formats_tier1',\n  ],\n};\nvar emwgpuStringToInt_DeviceLostReason = {\n  undefined: 1,\n  unknown: 1,\n  destroyed: 2,\n};\nvar runtimeKeepalivePop = () => {\n  runtimeKeepaliveCounter -= 1;\n};\nfunction _emwgpuAdapterRequestDevice(\n  adapterPtr,\n  futureId,\n  deviceLostFutureId,\n  devicePtr,\n  queuePtr,\n  descriptor\n) {\n  adapterPtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  deviceLostFutureId = bigintToI53Checked(deviceLostFutureId);\n  devicePtr >>>= 0;\n  queuePtr >>>= 0;\n  descriptor >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  var desc = {};\n  if (descriptor) {\n    var requiredFeatureCount = (growMemViews(), HEAPU32)[\n      ((descriptor + 12) >>> 2) >>> 0\n    ];\n    if (requiredFeatureCount) {\n      var requiredFeaturesPtr = (growMemViews(), HEAPU32)[\n        ((descriptor + 16) >>> 2) >>> 0\n      ];\n      desc['requiredFeatures'] = Array.from(\n        (growMemViews(), HEAPU32).subarray(\n          (requiredFeaturesPtr >>> 2) >>> 0,\n          ((requiredFeaturesPtr + requiredFeatureCount * 4) >>> 2) >>> 0\n        ),\n        (feature) => WebGPU.FeatureName[feature]\n      );\n    }\n    var limitsPtr = (growMemViews(), HEAPU32)[((descriptor + 20) >>> 2) >>> 0];\n    if (limitsPtr) {\n      var nextInChainPtr = (growMemViews(), HEAPU32)[(limitsPtr >>> 2) >>> 0];\n      var requiredLimits = {};\n      function setLimitU32IfDefined(\n        name,\n        basePtr,\n        limitOffset,\n        ignoreIfZero = false\n      ) {\n        var ptr = basePtr + limitOffset;\n        var value = (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0];\n        if (value != 4294967295 && (!ignoreIfZero || value != 0)) {\n          requiredLimits[name] = value;\n        }\n      }\n      function setLimitU64IfDefined(name, basePtr, limitOffset) {\n        var ptr = basePtr + limitOffset;\n        var limitPart1 = (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0];\n        var limitPart2 = (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0];\n        if (limitPart1 != 4294967295 || limitPart2 != 4294967295) {\n          requiredLimits[name] = readI53FromI64(ptr);\n        }\n      }\n      setLimitU32IfDefined('maxTextureDimension1D', limitsPtr, 4);\n      setLimitU32IfDefined('maxTextureDimension2D', limitsPtr, 8);\n      setLimitU32IfDefined('maxTextureDimension3D', limitsPtr, 12);\n      setLimitU32IfDefined('maxTextureArrayLayers', limitsPtr, 16);\n      setLimitU32IfDefined('maxBindGroups', limitsPtr, 20);\n      setLimitU32IfDefined('maxBindGroupsPlusVertexBuffers', limitsPtr, 24);\n      setLimitU32IfDefined('maxBindingsPerBindGroup', limitsPtr, 28);\n      setLimitU32IfDefined(\n        'maxDynamicUniformBuffersPerPipelineLayout',\n        limitsPtr,\n        32\n      );\n      setLimitU32IfDefined(\n        'maxDynamicStorageBuffersPerPipelineLayout',\n        limitsPtr,\n        36\n      );\n      setLimitU32IfDefined('maxSampledTexturesPerShaderStage', limitsPtr, 40);\n      setLimitU32IfDefined('maxSamplersPerShaderStage', limitsPtr, 44);\n      setLimitU32IfDefined('maxStorageBuffersPerShaderStage', limitsPtr, 48);\n      setLimitU32IfDefined('maxStorageTexturesPerShaderStage', limitsPtr, 52);\n      setLimitU32IfDefined('maxUniformBuffersPerShaderStage', limitsPtr, 56);\n      setLimitU32IfDefined('minUniformBufferOffsetAlignment', limitsPtr, 80);\n      setLimitU32IfDefined('minStorageBufferOffsetAlignment', limitsPtr, 84);\n      setLimitU64IfDefined('maxUniformBufferBindingSize', limitsPtr, 64);\n      setLimitU64IfDefined('maxStorageBufferBindingSize', limitsPtr, 72);\n      setLimitU32IfDefined('maxVertexBuffers', limitsPtr, 88);\n      setLimitU64IfDefined('maxBufferSize', limitsPtr, 96);\n      setLimitU32IfDefined('maxVertexAttributes', limitsPtr, 104);\n      setLimitU32IfDefined('maxVertexBufferArrayStride', limitsPtr, 108);\n      setLimitU32IfDefined('maxInterStageShaderVariables', limitsPtr, 112);\n      setLimitU32IfDefined('maxColorAttachments', limitsPtr, 116);\n      setLimitU32IfDefined('maxColorAttachmentBytesPerSample', limitsPtr, 120);\n      setLimitU32IfDefined('maxComputeWorkgroupStorageSize', limitsPtr, 124);\n      setLimitU32IfDefined('maxComputeInvocationsPerWorkgroup', limitsPtr, 128);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeX', limitsPtr, 132);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeY', limitsPtr, 136);\n      setLimitU32IfDefined('maxComputeWorkgroupSizeZ', limitsPtr, 140);\n      setLimitU32IfDefined('maxComputeWorkgroupsPerDimension', limitsPtr, 144);\n      setLimitU32IfDefined('maxImmediateSize', limitsPtr, 148, true);\n      if (nextInChainPtr !== 0) {\n        var sType = (growMemViews(), HEAP32)[\n          ((nextInChainPtr + 4) >>> 2) >>> 0\n        ];\n        var compatibilityModeLimitsPtr = nextInChainPtr;\n        if ('maxStorageBuffersInVertexStage' in GPUSupportedLimits.prototype) {\n          setLimitU32IfDefined(\n            'maxStorageBuffersInVertexStage',\n            compatibilityModeLimitsPtr,\n            8\n          );\n          setLimitU32IfDefined(\n            'maxStorageTexturesInVertexStage',\n            compatibilityModeLimitsPtr,\n            12\n          );\n          setLimitU32IfDefined(\n            'maxStorageBuffersInFragmentStage',\n            compatibilityModeLimitsPtr,\n            16\n          );\n          setLimitU32IfDefined(\n            'maxStorageTexturesInFragmentStage',\n            compatibilityModeLimitsPtr,\n            20\n          );\n        }\n      }\n      desc['requiredLimits'] = requiredLimits;\n    }\n    var defaultQueuePtr = (growMemViews(), HEAPU32)[\n      ((descriptor + 24) >>> 2) >>> 0\n    ];\n    if (defaultQueuePtr) {\n      var defaultQueueDesc = {\n        label: WebGPU.makeStringFromOptionalStringView(defaultQueuePtr + 4),\n      };\n      desc['defaultQueue'] = defaultQueueDesc;\n    }\n    desc['label'] = WebGPU.makeStringFromOptionalStringView(descriptor + 4);\n  }\n  runtimeKeepalivePush();\n  WebGPU.Internals.futureInsert(\n    futureId,\n    adapter.requestDevice(desc).then(\n      (device) => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);\n          WebGPU.Internals.jsObjectInsert(devicePtr, device);\n          WebGPU.Internals.futureInsert(\n            deviceLostFutureId,\n            device.lost.then((info) => {\n              callUserCallback(() => {\n                device.onuncapturederror = (ev) => {};\n                var sp = stackSave();\n                var messagePtr = stringToUTF8OnStack(info.message);\n                _emwgpuOnDeviceLostCompleted(\n                  deviceLostFutureId,\n                  emwgpuStringToInt_DeviceLostReason[info.reason],\n                  messagePtr\n                );\n                stackRestore(sp);\n              });\n            })\n          );\n          device.onuncapturederror = (ev) => {\n            var type = 5;\n            if (ev.error instanceof GPUValidationError) type = 2;\n            else if (ev.error instanceof GPUOutOfMemoryError) type = 3;\n            else if (ev.error instanceof GPUInternalError) type = 4;\n            var sp = stackSave();\n            var messagePtr = stringToUTF8OnStack(ev.error.message);\n            _emwgpuOnUncapturedError(devicePtr, type, messagePtr);\n            stackRestore(sp);\n          };\n          _emwgpuOnRequestDeviceCompleted(futureId, 1, devicePtr, 0);\n        });\n      },\n      (ex) => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          _emwgpuOnRequestDeviceCompleted(futureId, 3, devicePtr, messagePtr);\n          if (deviceLostFutureId) {\n            _emwgpuOnDeviceLostCompleted(deviceLostFutureId, 4, messagePtr);\n          }\n          stackRestore(sp);\n        });\n      }\n    )\n  );\n}\nfunction _emwgpuBufferDestroy(bufferPtr) {\n  bufferPtr >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  if (onUnmap) {\n    for (var i = 0; i < onUnmap.length; ++i) {\n      onUnmap[i]();\n    }\n    delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  }\n  buffer.destroy();\n}\nvar warnOnce = (text) => {\n  warnOnce.shown ||= {};\n  if (!warnOnce.shown[text]) {\n    warnOnce.shown[text] = 1;\n    if (ENVIRONMENT_IS_NODE) text = 'warning: ' + text;\n    err(text);\n  }\n};\nfunction _emwgpuBufferGetConstMappedRange(bufferPtr, offset, size) {\n  bufferPtr >>>= 0;\n  offset >>>= 0;\n  size >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  if (size == 4294967295) size = undefined;\n  var mapped;\n  try {\n    mapped = buffer.getMappedRange(offset, size);\n  } catch (ex) {\n    return 0;\n  }\n  var data = _memalign(16, mapped.byteLength);\n  (growMemViews(), HEAPU8).set(new Uint8Array(mapped), data >>> 0);\n  WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(() => _free(data));\n  return data;\n}\nvar _emwgpuBufferMapAsync = function (bufferPtr, futureId, mode, offset, size) {\n  bufferPtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  mode = bigintToI53Checked(mode);\n  offset >>>= 0;\n  size >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];\n  if (size == 4294967295) size = undefined;\n  runtimeKeepalivePush();\n  WebGPU.Internals.futureInsert(\n    futureId,\n    buffer.mapAsync(mode, offset, size).then(\n      () => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          _emwgpuOnMapAsyncCompleted(futureId, 1, 0);\n        });\n      },\n      (ex) => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          var status =\n            ex.name === 'AbortError' ? 4 : ex.name === 'OperationError' ? 3 : 0;\n          _emwgpuOnMapAsyncCompleted(futureId, status, messagePtr);\n          delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n        });\n      }\n    )\n  );\n};\nfunction _emwgpuBufferUnmap(bufferPtr) {\n  bufferPtr >>>= 0;\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  if (!onUnmap) {\n    return;\n  }\n  for (var i = 0; i < onUnmap.length; ++i) {\n    onUnmap[i]();\n  }\n  delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];\n  buffer.unmap();\n}\nfunction _emwgpuDelete(ptr) {\n  ptr >>>= 0;\n  delete WebGPU.Internals.jsObjects[ptr];\n}\nfunction _emwgpuDeviceCreateBuffer(devicePtr, descriptor, bufferPtr) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  bufferPtr >>>= 0;\n  var mappedAtCreation = !!(growMemViews(), HEAPU32)[\n    ((descriptor + 32) >>> 2) >>> 0\n  ];\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    usage: (growMemViews(), HEAPU32)[((descriptor + 16) >>> 2) >>> 0],\n    size: readI53FromI64(descriptor + 24),\n    mappedAtCreation,\n  };\n  var device = WebGPU.getJsObject(devicePtr);\n  var buffer;\n  try {\n    buffer = device.createBuffer(desc);\n  } catch (ex) {\n    return false;\n  }\n  WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);\n  if (mappedAtCreation) {\n    WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];\n  }\n  return true;\n}\nfunction _emwgpuDeviceCreateShaderModule(\n  devicePtr,\n  descriptor,\n  shaderModulePtr\n) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  shaderModulePtr >>>= 0;\n  var nextInChainPtr = (growMemViews(), HEAPU32)[(descriptor >>> 2) >>> 0];\n  var sType = (growMemViews(), HEAP32)[((nextInChainPtr + 4) >>> 2) >>> 0];\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    code: '',\n  };\n  switch (sType) {\n    case 2: {\n      desc['code'] = WebGPU.makeStringFromStringView(nextInChainPtr + 8);\n      break;\n    }\n  }\n  var device = WebGPU.getJsObject(devicePtr);\n  WebGPU.Internals.jsObjectInsert(\n    shaderModulePtr,\n    device.createShaderModule(desc)\n  );\n}\nvar _emwgpuDeviceDestroy = (devicePtr) => {\n  const device = WebGPU.getJsObject(devicePtr);\n  device.onuncapturederror = null;\n  device.destroy();\n};\nfunction _emwgpuInstanceRequestAdapter(\n  instancePtr,\n  futureId,\n  options,\n  adapterPtr\n) {\n  instancePtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  options >>>= 0;\n  adapterPtr >>>= 0;\n  var opts;\n  if (options) {\n    opts = {\n      featureLevel:\n        WebGPU.FeatureLevel[\n          (growMemViews(), HEAP32)[((options + 4) >>> 2) >>> 0]\n        ],\n      powerPreference:\n        WebGPU.PowerPreference[\n          (growMemViews(), HEAP32)[((options + 8) >>> 2) >>> 0]\n        ],\n      forceFallbackAdapter: !!(growMemViews(), HEAPU32)[\n        ((options + 12) >>> 2) >>> 0\n      ],\n    };\n    var nextInChainPtr = (growMemViews(), HEAPU32)[(options >>> 2) >>> 0];\n    if (nextInChainPtr !== 0) {\n      var sType = (growMemViews(), HEAP32)[((nextInChainPtr + 4) >>> 2) >>> 0];\n      var webxrOptions = nextInChainPtr;\n      opts.xrCompatible = !!(growMemViews(), HEAPU32)[\n        ((webxrOptions + 8) >>> 2) >>> 0\n      ];\n    }\n  }\n  if (!('gpu' in navigator)) {\n    var sp = stackSave();\n    var messagePtr = stringToUTF8OnStack(\n      'WebGPU not available on this browser (navigator.gpu is not available)'\n    );\n    _emwgpuOnRequestAdapterCompleted(futureId, 3, adapterPtr, messagePtr);\n    stackRestore(sp);\n    return;\n  }\n  runtimeKeepalivePush();\n  WebGPU.Internals.futureInsert(\n    futureId,\n    navigator.gpu.requestAdapter(opts).then(\n      (adapter) => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          if (adapter) {\n            WebGPU.Internals.jsObjectInsert(adapterPtr, adapter);\n            _emwgpuOnRequestAdapterCompleted(futureId, 1, adapterPtr, 0);\n          } else {\n            var sp = stackSave();\n            var messagePtr = stringToUTF8OnStack(\n              'WebGPU not available on this browser (requestAdapter returned null)'\n            );\n            _emwgpuOnRequestAdapterCompleted(\n              futureId,\n              3,\n              adapterPtr,\n              messagePtr\n            );\n            stackRestore(sp);\n          }\n        });\n      },\n      (ex) => {\n        runtimeKeepalivePop();\n        callUserCallback(() => {\n          var sp = stackSave();\n          var messagePtr = stringToUTF8OnStack(ex.message);\n          _emwgpuOnRequestAdapterCompleted(futureId, 4, adapterPtr, messagePtr);\n          stackRestore(sp);\n        });\n      }\n    )\n  );\n}\nvar _emwgpuQueueOnSubmittedWorkDone = function (queuePtr, futureId) {\n  queuePtr >>>= 0;\n  futureId = bigintToI53Checked(futureId);\n  var queue = WebGPU.getJsObject(queuePtr);\n  runtimeKeepalivePush();\n  WebGPU.Internals.futureInsert(\n    futureId,\n    queue.onSubmittedWorkDone().then(() => {\n      runtimeKeepalivePop();\n      callUserCallback(() => {\n        _emwgpuOnWorkDoneCompleted(futureId, 1);\n      });\n    })\n  );\n};\nvar _emwgpuWaitAny = function (futurePtr, futureCount, timeoutMSPtr) {\n  futurePtr >>>= 0;\n  futureCount >>>= 0;\n  timeoutMSPtr >>>= 0;\n  return Asyncify.handleAsync(async () => {\n    var promises = [];\n    if (timeoutMSPtr) {\n      var timeoutMS = (growMemViews(), HEAP32)[(timeoutMSPtr >>> 2) >>> 0];\n      promises.length = futureCount + 1;\n      promises[futureCount] = new Promise((resolve) =>\n        setTimeout(resolve, timeoutMS, 0)\n      );\n    } else {\n      promises.length = futureCount;\n    }\n    for (var i = 0; i < futureCount; ++i) {\n      var futureId = readI53FromI64(futurePtr + i * 8);\n      if (!(futureId in WebGPU.Internals.futures)) {\n        return futureId;\n      }\n      promises[i] = WebGPU.Internals.futures[futureId];\n    }\n    const firstResolvedFuture = await Promise.race(promises);\n    delete WebGPU.Internals.futures[firstResolvedFuture];\n    return firstResolvedFuture;\n  });\n};\n_emwgpuWaitAny.isAsync = true;\nvar ENV = {};\nvar getExecutableName = () => thisProgram || './this.program';\nvar getEnvStrings = () => {\n  if (!getEnvStrings.strings) {\n    var lang =\n      ((typeof navigator == 'object' && navigator.language) || 'C').replace(\n        '-',\n        '_'\n      ) + '.UTF-8';\n    var env = {\n      USER: 'web_user',\n      LOGNAME: 'web_user',\n      PATH: '/',\n      PWD: '/',\n      HOME: '/home/web_user',\n      LANG: lang,\n      _: getExecutableName(),\n    };\n    for (var x in ENV) {\n      if (ENV[x] === undefined) delete env[x];\n      else env[x] = ENV[x];\n    }\n    var strings = [];\n    for (var x in env) {\n      strings.push(`${x}=${env[x]}`);\n    }\n    getEnvStrings.strings = strings;\n  }\n  return getEnvStrings.strings;\n};\nfunction _environ_get(__environ, environ_buf) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(15, 0, 1, __environ, environ_buf);\n  __environ >>>= 0;\n  environ_buf >>>= 0;\n  var bufSize = 0;\n  var envp = 0;\n  for (var string of getEnvStrings()) {\n    var ptr = environ_buf + bufSize;\n    (growMemViews(), HEAPU32)[((__environ + envp) >>> 2) >>> 0] = ptr;\n    bufSize += stringToUTF8(string, ptr, Infinity) + 1;\n    envp += 4;\n  }\n  return 0;\n}\nfunction _environ_sizes_get(penviron_count, penviron_buf_size) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(16, 0, 1, penviron_count, penviron_buf_size);\n  penviron_count >>>= 0;\n  penviron_buf_size >>>= 0;\n  var strings = getEnvStrings();\n  (growMemViews(), HEAPU32)[(penviron_count >>> 2) >>> 0] = strings.length;\n  var bufSize = 0;\n  for (var string of strings) {\n    bufSize += lengthBytesUTF8(string) + 1;\n  }\n  (growMemViews(), HEAPU32)[(penviron_buf_size >>> 2) >>> 0] = bufSize;\n  return 0;\n}\nfunction _fd_close(fd) {\n  if (ENVIRONMENT_IS_PTHREAD) return proxyToMainThread(17, 0, 1, fd);\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    FS.close(stream);\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar doReadv = (stream, iov, iovcnt, offset) => {\n  var ret = 0;\n  for (var i = 0; i < iovcnt; i++) {\n    var ptr = (growMemViews(), HEAPU32)[(iov >>> 2) >>> 0];\n    var len = (growMemViews(), HEAPU32)[((iov + 4) >>> 2) >>> 0];\n    iov += 8;\n    var curr = FS.read(stream, (growMemViews(), HEAP8), ptr, len, offset);\n    if (curr < 0) return -1;\n    ret += curr;\n    if (curr < len) break;\n    if (typeof offset != 'undefined') {\n      offset += curr;\n    }\n  }\n  return ret;\n};\nfunction _fd_read(fd, iov, iovcnt, pnum) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(18, 0, 1, fd, iov, iovcnt, pnum);\n  iov >>>= 0;\n  iovcnt >>>= 0;\n  pnum >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var num = doReadv(stream, iov, iovcnt);\n    (growMemViews(), HEAPU32)[(pnum >>> 2) >>> 0] = num;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nfunction _fd_seek(fd, offset, whence, newOffset) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(19, 0, 1, fd, offset, whence, newOffset);\n  offset = bigintToI53Checked(offset);\n  newOffset >>>= 0;\n  try {\n    if (isNaN(offset)) return 61;\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    FS.llseek(stream, offset, whence);\n    (growMemViews(), HEAP64)[(newOffset >>> 3) >>> 0] = BigInt(stream.position);\n    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar doWritev = (stream, iov, iovcnt, offset) => {\n  var ret = 0;\n  for (var i = 0; i < iovcnt; i++) {\n    var ptr = (growMemViews(), HEAPU32)[(iov >>> 2) >>> 0];\n    var len = (growMemViews(), HEAPU32)[((iov + 4) >>> 2) >>> 0];\n    iov += 8;\n    var curr = FS.write(stream, (growMemViews(), HEAP8), ptr, len, offset);\n    if (curr < 0) return -1;\n    ret += curr;\n    if (curr < len) {\n      break;\n    }\n    if (typeof offset != 'undefined') {\n      offset += curr;\n    }\n  }\n  return ret;\n};\nfunction _fd_write(fd, iov, iovcnt, pnum) {\n  if (ENVIRONMENT_IS_PTHREAD)\n    return proxyToMainThread(20, 0, 1, fd, iov, iovcnt, pnum);\n  iov >>>= 0;\n  iovcnt >>>= 0;\n  pnum >>>= 0;\n  try {\n    var stream = SYSCALLS.getStreamFromFD(fd);\n    var num = doWritev(stream, iov, iovcnt);\n    (growMemViews(), HEAPU32)[(pnum >>> 2) >>> 0] = num;\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nfunction _llvm_eh_typeid_for(type) {\n  type >>>= 0;\n  return type;\n}\nfunction _random_get(buffer, size) {\n  buffer >>>= 0;\n  size >>>= 0;\n  try {\n    randomFill(\n      (growMemViews(), HEAPU8).subarray(buffer >>> 0, (buffer + size) >>> 0)\n    );\n    return 0;\n  } catch (e) {\n    if (typeof FS == 'undefined' || !(e.name === 'ErrnoError')) throw e;\n    return e.errno;\n  }\n}\nvar emwgpuStringToInt_FeatureName = {\n  'core-features-and-limits': 1,\n  'depth-clip-control': 2,\n  'depth32float-stencil8': 3,\n  'texture-compression-bc': 4,\n  'texture-compression-bc-sliced-3d': 5,\n  'texture-compression-etc2': 6,\n  'texture-compression-astc': 7,\n  'texture-compression-astc-sliced-3d': 8,\n  'timestamp-query': 9,\n  'indirect-first-instance': 10,\n  'shader-f16': 11,\n  'rg11b10ufloat-renderable': 12,\n  'bgra8unorm-storage': 13,\n  'float32-filterable': 14,\n  'float32-blendable': 15,\n  'clip-distances': 16,\n  'dual-source-blending': 17,\n  subgroups: 18,\n  'texture-formats-tier1': 19,\n  'texture-formats-tier2': 20,\n  'primitive-index': 21,\n  'texture-component-swizzle': 22,\n  'chromium-experimental-unorm16-texture-formats': 327692,\n  'chromium-experimental-multi-draw-indirect': 327729,\n};\nfunction _wgpuAdapterGetFeatures(adapterPtr, supportedFeatures) {\n  adapterPtr >>>= 0;\n  supportedFeatures >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  var featuresPtr = _malloc(adapter.features.size * 4);\n  var offset = 0;\n  var numFeatures = 0;\n  for (const feature of adapter.features) {\n    var featureEnumValue = emwgpuStringToInt_FeatureName[feature];\n    if (featureEnumValue >= 0) {\n      (growMemViews(), HEAP32)[((featuresPtr + offset) >>> 2) >>> 0] =\n        featureEnumValue;\n      offset += 4;\n      numFeatures++;\n    }\n  }\n  (growMemViews(), HEAPU32)[((supportedFeatures + 4) >>> 2) >>> 0] =\n    featuresPtr;\n  (growMemViews(), HEAPU32)[(supportedFeatures >>> 2) >>> 0] = numFeatures;\n}\nfunction _wgpuAdapterGetInfo(adapterPtr, info) {\n  adapterPtr >>>= 0;\n  info >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  WebGPU.fillAdapterInfoStruct(adapter.info, info);\n  return 1;\n}\nfunction _wgpuAdapterGetLimits(adapterPtr, limitsOutPtr) {\n  adapterPtr >>>= 0;\n  limitsOutPtr >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  WebGPU.fillLimitStruct(adapter.limits, limitsOutPtr);\n  return 1;\n}\nfunction _wgpuAdapterHasFeature(adapterPtr, featureEnumValue) {\n  adapterPtr >>>= 0;\n  var adapter = WebGPU.getJsObject(adapterPtr);\n  return adapter.features.has(WebGPU.FeatureName[featureEnumValue]);\n}\nvar _wgpuBufferGetSize = function (bufferPtr) {\n  bufferPtr >>>= 0;\n  var ret = (() => {\n    var buffer = WebGPU.getJsObject(bufferPtr);\n    return buffer.size;\n  })();\n  return BigInt(ret);\n};\nfunction _wgpuCommandEncoderBeginComputePass(encoderPtr, descriptor) {\n  encoderPtr >>>= 0;\n  descriptor >>>= 0;\n  var desc;\n  if (descriptor) {\n    desc = {\n      label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n      timestampWrites: WebGPU.makePassTimestampWrites(\n        (growMemViews(), HEAPU32)[((descriptor + 12) >>> 2) >>> 0]\n      ),\n    };\n  }\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var ptr = _emwgpuCreateComputePassEncoder(0);\n  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.beginComputePass(desc));\n  return ptr;\n}\nfunction _wgpuCommandEncoderCopyBufferToBuffer(\n  encoderPtr,\n  srcPtr,\n  srcOffset,\n  dstPtr,\n  dstOffset,\n  size\n) {\n  encoderPtr >>>= 0;\n  srcPtr >>>= 0;\n  srcOffset = bigintToI53Checked(srcOffset);\n  dstPtr >>>= 0;\n  dstOffset = bigintToI53Checked(dstOffset);\n  size = bigintToI53Checked(size);\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var src = WebGPU.getJsObject(srcPtr);\n  var dst = WebGPU.getJsObject(dstPtr);\n  commandEncoder.copyBufferToBuffer(src, srcOffset, dst, dstOffset, size);\n}\nfunction _wgpuCommandEncoderFinish(encoderPtr, descriptor) {\n  encoderPtr >>>= 0;\n  descriptor >>>= 0;\n  var commandEncoder = WebGPU.getJsObject(encoderPtr);\n  var ptr = _emwgpuCreateCommandBuffer(0);\n  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.finish());\n  return ptr;\n}\nfunction _wgpuComputePassEncoderDispatchWorkgroups(passPtr, x, y, z) {\n  passPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  pass.dispatchWorkgroups(x, y, z);\n}\nfunction _wgpuComputePassEncoderEnd(passPtr) {\n  passPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  pass.end();\n}\nfunction _wgpuComputePassEncoderSetBindGroup(\n  passPtr,\n  groupIndex,\n  groupPtr,\n  dynamicOffsetCount,\n  dynamicOffsetsPtr\n) {\n  passPtr >>>= 0;\n  groupPtr >>>= 0;\n  dynamicOffsetCount >>>= 0;\n  dynamicOffsetsPtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  var group = WebGPU.getJsObject(groupPtr);\n  if (dynamicOffsetCount == 0) {\n    pass.setBindGroup(groupIndex, group);\n  } else {\n    pass.setBindGroup(\n      groupIndex,\n      group,\n      (growMemViews(), HEAPU32),\n      dynamicOffsetsPtr >>> 2,\n      dynamicOffsetCount\n    );\n  }\n}\nfunction _wgpuComputePassEncoderSetPipeline(passPtr, pipelinePtr) {\n  passPtr >>>= 0;\n  pipelinePtr >>>= 0;\n  var pass = WebGPU.getJsObject(passPtr);\n  var pipeline = WebGPU.getJsObject(pipelinePtr);\n  pass.setPipeline(pipeline);\n}\nfunction _wgpuComputePipelineGetBindGroupLayout(pipelinePtr, groupIndex) {\n  pipelinePtr >>>= 0;\n  var pipeline = WebGPU.getJsObject(pipelinePtr);\n  var ptr = _emwgpuCreateBindGroupLayout(0);\n  WebGPU.Internals.jsObjectInsert(ptr, pipeline.getBindGroupLayout(groupIndex));\n  return ptr;\n}\nvar _wgpuDeviceCreateBindGroup = function (devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  function makeEntry(entryPtr) {\n    var bufferPtr = (growMemViews(), HEAPU32)[((entryPtr + 8) >>> 2) >>> 0];\n    var samplerPtr = (growMemViews(), HEAPU32)[((entryPtr + 32) >>> 2) >>> 0];\n    var textureViewPtr = (growMemViews(), HEAPU32)[\n      ((entryPtr + 36) >>> 2) >>> 0\n    ];\n    var externalTexturePtr = 0;\n    WebGPU.iterateExtensions(entryPtr, {\n      327681: (ptr) => {\n        externalTexturePtr = (growMemViews(), HEAPU32)[((ptr + 8) >>> 2) >>> 0];\n      },\n    });\n    var resource;\n    if (bufferPtr) {\n      var size = readI53FromI64(entryPtr + 24);\n      if (size == -1) size = undefined;\n      resource = {\n        buffer: WebGPU.getJsObject(bufferPtr),\n        offset: readI53FromI64(entryPtr + 16),\n        size,\n      };\n    } else {\n      resource = WebGPU.getJsObject(\n        samplerPtr || textureViewPtr || externalTexturePtr\n      );\n    }\n    return {\n      binding: (growMemViews(), HEAPU32)[((entryPtr + 4) >>> 2) >>> 0],\n      resource,\n    };\n  }\n  function makeEntries(count, entriesPtrs) {\n    var entries = [];\n    for (var i = 0; i < count; ++i) {\n      entries.push(makeEntry(entriesPtrs + 40 * i));\n    }\n    return entries;\n  }\n  var desc = {\n    label: WebGPU.makeStringFromOptionalStringView(descriptor + 4),\n    layout: WebGPU.getJsObject(\n      (growMemViews(), HEAPU32)[((descriptor + 12) >>> 2) >>> 0]\n    ),\n    entries: makeEntries(\n      (growMemViews(), HEAPU32)[((descriptor + 16) >>> 2) >>> 0],\n      (growMemViews(), HEAPU32)[((descriptor + 20) >>> 2) >>> 0]\n    ),\n  };\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateBindGroup(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroup(desc));\n  return ptr;\n};\nfunction _wgpuDeviceCreateCommandEncoder(devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  var desc;\n  if (descriptor) {\n    desc = { label: WebGPU.makeStringFromOptionalStringView(descriptor + 4) };\n  }\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateCommandEncoder(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createCommandEncoder(desc));\n  return ptr;\n}\nfunction _wgpuDeviceCreateComputePipeline(devicePtr, descriptor) {\n  devicePtr >>>= 0;\n  descriptor >>>= 0;\n  var desc = WebGPU.makeComputePipelineDesc(descriptor);\n  var device = WebGPU.getJsObject(devicePtr);\n  var ptr = _emwgpuCreateComputePipeline(0);\n  WebGPU.Internals.jsObjectInsert(ptr, device.createComputePipeline(desc));\n  return ptr;\n}\nvar _wgpuQueueSubmit = function (queuePtr, commandCount, commands) {\n  queuePtr >>>= 0;\n  commandCount >>>= 0;\n  commands >>>= 0;\n  var queue = WebGPU.getJsObject(queuePtr);\n  var cmds = Array.from(\n    (growMemViews(), HEAP32).subarray(\n      (commands >>> 2) >>> 0,\n      ((commands + commandCount * 4) >>> 2) >>> 0\n    ),\n    (id) => WebGPU.getJsObject(id)\n  );\n  queue.submit(cmds);\n};\nfunction _wgpuQueueWriteBuffer(queuePtr, bufferPtr, bufferOffset, data, size) {\n  queuePtr >>>= 0;\n  bufferPtr >>>= 0;\n  bufferOffset = bigintToI53Checked(bufferOffset);\n  data >>>= 0;\n  size >>>= 0;\n  var queue = WebGPU.getJsObject(queuePtr);\n  var buffer = WebGPU.getJsObject(bufferPtr);\n  var subarray = (growMemViews(), HEAPU8).subarray(\n    data >>> 0,\n    (data + size) >>> 0\n  );\n  queue.writeBuffer(buffer, bufferOffset, subarray, 0, size);\n}\nvar runAndAbortIfError = (func) => {\n  try {\n    return func();\n  } catch (e) {\n    abort(e);\n  }\n};\nvar Asyncify = {\n  instrumentWasmImports(imports) {\n    var importPattern = /^(invoke_.*|__asyncjs__.*)$/;\n    for (let [x, original] of Object.entries(imports)) {\n      if (typeof original == 'function') {\n        let isAsyncifyImport = original.isAsync || importPattern.test(x);\n      }\n    }\n  },\n  instrumentFunction(original) {\n    var wrapper = (...args) => {\n      Asyncify.exportCallStack.push(original);\n      try {\n        return original(...args);\n      } finally {\n        if (!ABORT) {\n          var top = Asyncify.exportCallStack.pop();\n          Asyncify.maybeStopUnwind();\n        }\n      }\n    };\n    Asyncify.funcWrappers.set(original, wrapper);\n    return wrapper;\n  },\n  instrumentWasmExports(exports) {\n    var ret = {};\n    for (let [x, original] of Object.entries(exports)) {\n      if (typeof original == 'function') {\n        var wrapper = Asyncify.instrumentFunction(original);\n        ret[x] = wrapper;\n      } else {\n        ret[x] = original;\n      }\n    }\n    return ret;\n  },\n  State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 },\n  state: 0,\n  StackSize: 4096,\n  currData: null,\n  handleSleepReturnValue: 0,\n  exportCallStack: [],\n  callstackFuncToId: new Map(),\n  callStackIdToFunc: new Map(),\n  funcWrappers: new Map(),\n  callStackId: 0,\n  asyncPromiseHandlers: null,\n  sleepCallbacks: [],\n  getCallStackId(func) {\n    if (!Asyncify.callstackFuncToId.has(func)) {\n      var id = Asyncify.callStackId++;\n      Asyncify.callstackFuncToId.set(func, id);\n      Asyncify.callStackIdToFunc.set(id, func);\n    }\n    return Asyncify.callstackFuncToId.get(func);\n  },\n  maybeStopUnwind() {\n    if (\n      Asyncify.currData &&\n      Asyncify.state === Asyncify.State.Unwinding &&\n      Asyncify.exportCallStack.length === 0\n    ) {\n      Asyncify.state = Asyncify.State.Normal;\n      runtimeKeepalivePush();\n      runAndAbortIfError(_asyncify_stop_unwind);\n      if (typeof Fibers != 'undefined') {\n        Fibers.trampoline();\n      }\n    }\n  },\n  whenDone() {\n    return new Promise((resolve, reject) => {\n      Asyncify.asyncPromiseHandlers = { resolve, reject };\n    });\n  },\n  allocateData() {\n    var ptr = _malloc(12 + Asyncify.StackSize);\n    Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);\n    Asyncify.setDataRewindFunc(ptr);\n    return ptr;\n  },\n  setDataHeader(ptr, stack, stackSize) {\n    (growMemViews(), HEAPU32)[(ptr >>> 2) >>> 0] = stack;\n    (growMemViews(), HEAPU32)[((ptr + 4) >>> 2) >>> 0] = stack + stackSize;\n  },\n  setDataRewindFunc(ptr) {\n    var bottomOfCallStack = Asyncify.exportCallStack[0];\n    var rewindId = Asyncify.getCallStackId(bottomOfCallStack);\n    (growMemViews(), HEAP32)[((ptr + 8) >>> 2) >>> 0] = rewindId;\n  },\n  getDataRewindFunc(ptr) {\n    var id = (growMemViews(), HEAP32)[((ptr + 8) >>> 2) >>> 0];\n    var func = Asyncify.callStackIdToFunc.get(id);\n    return func;\n  },\n  doRewind(ptr) {\n    var original = Asyncify.getDataRewindFunc(ptr);\n    var func = Asyncify.funcWrappers.get(original);\n    runtimeKeepalivePop();\n    return func();\n  },\n  handleSleep(startAsync) {\n    if (ABORT) return;\n    if (Asyncify.state === Asyncify.State.Normal) {\n      var reachedCallback = false;\n      var reachedAfterCallback = false;\n      startAsync((handleSleepReturnValue = 0) => {\n        if (ABORT) return;\n        Asyncify.handleSleepReturnValue = handleSleepReturnValue;\n        reachedCallback = true;\n        if (!reachedAfterCallback) {\n          return;\n        }\n        Asyncify.state = Asyncify.State.Rewinding;\n        runAndAbortIfError(() => _asyncify_start_rewind(Asyncify.currData));\n        if (typeof MainLoop != 'undefined' && MainLoop.func) {\n          MainLoop.resume();\n        }\n        var asyncWasmReturnValue,\n          isError = false;\n        try {\n          asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);\n        } catch (err) {\n          asyncWasmReturnValue = err;\n          isError = true;\n        }\n        var handled = false;\n        if (!Asyncify.currData) {\n          var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;\n          if (asyncPromiseHandlers) {\n            Asyncify.asyncPromiseHandlers = null;\n            (isError\n              ? asyncPromiseHandlers.reject\n              : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);\n            handled = true;\n          }\n        }\n        if (isError && !handled) {\n          throw asyncWasmReturnValue;\n        }\n      });\n      reachedAfterCallback = true;\n      if (!reachedCallback) {\n        Asyncify.state = Asyncify.State.Unwinding;\n        Asyncify.currData = Asyncify.allocateData();\n        if (typeof MainLoop != 'undefined' && MainLoop.func) {\n          MainLoop.pause();\n        }\n        runAndAbortIfError(() => _asyncify_start_unwind(Asyncify.currData));\n      }\n    } else if (Asyncify.state === Asyncify.State.Rewinding) {\n      Asyncify.state = Asyncify.State.Normal;\n      runAndAbortIfError(_asyncify_stop_rewind);\n      _free(Asyncify.currData);\n      Asyncify.currData = null;\n      Asyncify.sleepCallbacks.forEach(callUserCallback);\n    } else {\n      abort(`invalid state: ${Asyncify.state}`);\n    }\n    return Asyncify.handleSleepReturnValue;\n  },\n  handleAsync: (startAsync) =>\n    Asyncify.handleSleep((wakeUp) => {\n      startAsync().then(wakeUp);\n    }),\n};\nvar getCFunc = (ident) => {\n  var func = Module['_' + ident];\n  return func;\n};\nvar writeArrayToMemory = (array, buffer) => {\n  (growMemViews(), HEAP8).set(array, buffer >>> 0);\n};\nvar ccall = (ident, returnType, argTypes, args, opts) => {\n  var toC = {\n    string: (str) => {\n      var ret = 0;\n      if (str !== null && str !== undefined && str !== 0) {\n        ret = stringToUTF8OnStack(str);\n      }\n      return ret;\n    },\n    array: (arr) => {\n      var ret = stackAlloc(arr.length);\n      writeArrayToMemory(arr, ret);\n      return ret;\n    },\n  };\n  function convertReturnValue(ret) {\n    if (returnType === 'string') {\n      return UTF8ToString(ret);\n    }\n    if (returnType === 'pointer') return ret >>> 0;\n    if (returnType === 'boolean') return Boolean(ret);\n    return ret;\n  }\n  var func = getCFunc(ident);\n  var cArgs = [];\n  var stack = 0;\n  if (args) {\n    for (var i = 0; i < args.length; i++) {\n      var converter = toC[argTypes[i]];\n      if (converter) {\n        if (stack === 0) stack = stackSave();\n        cArgs[i] = converter(args[i]);\n      } else {\n        cArgs[i] = args[i];\n      }\n    }\n  }\n  var previousAsync = Asyncify.currData;\n  var ret = func(...cArgs);\n  function onDone(ret) {\n    runtimeKeepalivePop();\n    if (stack !== 0) stackRestore(stack);\n    return convertReturnValue(ret);\n  }\n  var asyncMode = opts?.async;\n  runtimeKeepalivePush();\n  if (Asyncify.currData != previousAsync) {\n    return Asyncify.whenDone().then(onDone);\n  }\n  ret = onDone(ret);\n  if (asyncMode) return Promise.resolve(ret);\n  return ret;\n};\nvar cwrap = (ident, returnType, argTypes, opts) => {\n  var numericArgs =\n    !argTypes ||\n    argTypes.every((type) => type === 'number' || type === 'boolean');\n  var numericRet = returnType !== 'string';\n  if (numericRet && numericArgs && !opts) {\n    return getCFunc(ident);\n  }\n  return (...args) => ccall(ident, returnType, argTypes, args, opts);\n};\nvar FS_createPath = (...args) => FS.createPath(...args);\nvar FS_unlink = (...args) => FS.unlink(...args);\nvar FS_createLazyFile = (...args) => FS.createLazyFile(...args);\nvar FS_createDevice = (...args) => FS.createDevice(...args);\nPThread.init();\nFS.createPreloadedFile = FS_createPreloadedFile;\nFS.preloadFile = FS_preloadFile;\nFS.staticInit();\n{\n  initMemory();\n  if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];\n  if (Module['preloadPlugins']) preloadPlugins = Module['preloadPlugins'];\n  if (Module['print']) out = Module['print'];\n  if (Module['printErr']) err = Module['printErr'];\n  if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];\n  if (Module['arguments']) arguments_ = Module['arguments'];\n  if (Module['thisProgram']) thisProgram = Module['thisProgram'];\n  if (Module['preInit']) {\n    if (typeof Module['preInit'] == 'function')\n      Module['preInit'] = [Module['preInit']];\n    while (Module['preInit'].length > 0) {\n      Module['preInit'].shift()();\n    }\n  }\n}\nModule['mmapAlloc'] = mmapAlloc;\nModule['addRunDependency'] = addRunDependency;\nModule['removeRunDependency'] = removeRunDependency;\nModule['ccall'] = ccall;\nModule['cwrap'] = cwrap;\nModule['FS_preloadFile'] = FS_preloadFile;\nModule['FS_unlink'] = FS_unlink;\nModule['FS_createPath'] = FS_createPath;\nModule['FS_createDevice'] = FS_createDevice;\nModule['FS'] = FS;\nModule['FS_createDataFile'] = FS_createDataFile;\nModule['FS_createLazyFile'] = FS_createLazyFile;\nModule['MEMFS'] = MEMFS;\nvar proxiedFunctionTable = [\n  _proc_exit,\n  exitOnMainThread,\n  pthreadCreateProxied,\n  ___syscall_fcntl64,\n  ___syscall_fstat64,\n  ___syscall_getcwd,\n  ___syscall_getdents64,\n  ___syscall_ioctl,\n  ___syscall_lstat64,\n  ___syscall_newfstatat,\n  ___syscall_openat,\n  ___syscall_stat64,\n  __mmap_js,\n  __munmap_js,\n  __setitimer_js,\n  _environ_get,\n  _environ_sizes_get,\n  _fd_close,\n  _fd_read,\n  _fd_seek,\n  _fd_write,\n];\nvar _wllama_malloc,\n  _wllama_start,\n  _wllama_action,\n  _wllama_exit,\n  _wllama_debug,\n  _main,\n  _malloc,\n  _free,\n  _emwgpuCreateBindGroup,\n  _emwgpuCreateBindGroupLayout,\n  _emwgpuCreateCommandBuffer,\n  _emwgpuCreateCommandEncoder,\n  _emwgpuCreateComputePassEncoder,\n  _emwgpuCreateComputePipeline,\n  _emwgpuCreateExternalTexture,\n  _emwgpuCreatePipelineLayout,\n  _emwgpuCreateQuerySet,\n  _emwgpuCreateRenderBundle,\n  _emwgpuCreateRenderBundleEncoder,\n  _emwgpuCreateRenderPassEncoder,\n  _emwgpuCreateRenderPipeline,\n  _emwgpuCreateSampler,\n  _emwgpuCreateSurface,\n  _emwgpuCreateTexture,\n  _emwgpuCreateTextureView,\n  _emwgpuCreateAdapter,\n  _emwgpuCreateBuffer,\n  _emwgpuCreateDevice,\n  _emwgpuCreateQueue,\n  _emwgpuCreateShaderModule,\n  _emwgpuOnDeviceLostCompleted,\n  _emwgpuOnMapAsyncCompleted,\n  _emwgpuOnRequestAdapterCompleted,\n  _emwgpuOnRequestDeviceCompleted,\n  _emwgpuOnWorkDoneCompleted,\n  _emwgpuOnUncapturedError,\n  __emscripten_tls_init,\n  _pthread_self,\n  _emscripten_builtin_memalign,\n  __emscripten_thread_init,\n  __emscripten_thread_crashed,\n  __emscripten_run_js_on_main_thread,\n  __emscripten_thread_free_data,\n  __emscripten_thread_exit,\n  __emscripten_timeout,\n  __emscripten_check_mailbox,\n  _memalign,\n  _setThrew,\n  __emscripten_tempret_set,\n  _emscripten_stack_set_limits,\n  __emscripten_stack_restore,\n  __emscripten_stack_alloc,\n  _emscripten_stack_get_current,\n  ___cxa_decrement_exception_refcount,\n  ___cxa_increment_exception_refcount,\n  ___cxa_can_catch,\n  ___cxa_get_exception_ptr,\n  dynCall_v,\n  dynCall_ii,\n  dynCall_iii,\n  dynCall_vi,\n  dynCall_viii,\n  dynCall_viiiii,\n  dynCall_vii,\n  dynCall_iiiiiii,\n  dynCall_iiiii,\n  dynCall_iiiiii,\n  dynCall_viiiiii,\n  dynCall_vij,\n  dynCall_jii,\n  dynCall_viiii,\n  dynCall_iiii,\n  dynCall_iiiiiiii,\n  dynCall_iifff,\n  dynCall_iiiffiiii,\n  dynCall_ifi,\n  dynCall_iiiiiiiiiiiiii,\n  dynCall_iiiiiiiii,\n  dynCall_iiiiiiiiiiiiiiiiii,\n  dynCall_iiiiiiiiiiiiiii,\n  dynCall_iij,\n  dynCall_iiiiff,\n  dynCall_viijj,\n  dynCall_iiif,\n  dynCall_iiiiiiiiiiii,\n  dynCall_viif,\n  dynCall_viid,\n  dynCall_iiijj,\n  dynCall_iiijjjj,\n  dynCall_iiiiiiiiiffffffi,\n  dynCall_i,\n  dynCall_iiij,\n  dynCall_ji,\n  dynCall_iiiiiiiiii,\n  dynCall_j,\n  dynCall_viiiijjji,\n  dynCall_iiiiiiiiiifi,\n  dynCall_iiiiiiiiiiiijjiifiiiiiii,\n  dynCall_iiiiiiiiiiiiiiii,\n  dynCall_iiijjj,\n  dynCall_iiiiiiiiifi,\n  dynCall_iiiff,\n  dynCall_iiiiiiji,\n  dynCall_iiiiijiiijjjjjjj,\n  dynCall_viiiiiiiii,\n  dynCall_vj,\n  dynCall_viijii,\n  dynCall_viijijj,\n  dynCall_viiiij,\n  dynCall_viiij,\n  dynCall_viiiiiii,\n  dynCall_iiid,\n  dynCall_jiji,\n  dynCall_iidiiii,\n  dynCall_iiiij,\n  dynCall_iiiiij,\n  dynCall_jiiii,\n  dynCall_fiii,\n  dynCall_diii,\n  dynCall_viiiiiiiiii,\n  dynCall_viiiiiiiiiiiiiii,\n  dynCall_viij,\n  dynCall_viiiiiiii,\n  dynCall_viji,\n  dynCall_iiiiid,\n  dynCall_iiiiijj,\n  dynCall_iiiiiijj,\n  _asyncify_start_unwind,\n  _asyncify_stop_unwind,\n  _asyncify_start_rewind,\n  _asyncify_stop_rewind,\n  __indirect_function_table,\n  wasmTable;\nfunction assignWasmExports(wasmExports) {\n  _wllama_malloc = Module['_wllama_malloc'] = wasmExports['Jb'];\n  _wllama_start = Module['_wllama_start'] = wasmExports['Kb'];\n  _wllama_action = Module['_wllama_action'] = wasmExports['Lb'];\n  _wllama_exit = Module['_wllama_exit'] = wasmExports['Mb'];\n  _wllama_debug = Module['_wllama_debug'] = wasmExports['Nb'];\n  _main = Module['_main'] = wasmExports['Ob'];\n  _malloc = wasmExports['Pb'];\n  _free = wasmExports['Qb'];\n  _emwgpuCreateBindGroup = wasmExports['Rb'];\n  _emwgpuCreateBindGroupLayout = wasmExports['Sb'];\n  _emwgpuCreateCommandBuffer = wasmExports['Tb'];\n  _emwgpuCreateCommandEncoder = wasmExports['Ub'];\n  _emwgpuCreateComputePassEncoder = wasmExports['Vb'];\n  _emwgpuCreateComputePipeline = wasmExports['Wb'];\n  _emwgpuCreateExternalTexture = wasmExports['Xb'];\n  _emwgpuCreatePipelineLayout = wasmExports['Yb'];\n  _emwgpuCreateQuerySet = wasmExports['Zb'];\n  _emwgpuCreateRenderBundle = wasmExports['_b'];\n  _emwgpuCreateRenderBundleEncoder = wasmExports['$b'];\n  _emwgpuCreateRenderPassEncoder = wasmExports['ac'];\n  _emwgpuCreateRenderPipeline = wasmExports['bc'];\n  _emwgpuCreateSampler = wasmExports['cc'];\n  _emwgpuCreateSurface = wasmExports['dc'];\n  _emwgpuCreateTexture = wasmExports['ec'];\n  _emwgpuCreateTextureView = wasmExports['fc'];\n  _emwgpuCreateAdapter = wasmExports['gc'];\n  _emwgpuCreateBuffer = wasmExports['hc'];\n  _emwgpuCreateDevice = wasmExports['ic'];\n  _emwgpuCreateQueue = wasmExports['jc'];\n  _emwgpuCreateShaderModule = wasmExports['kc'];\n  _emwgpuOnDeviceLostCompleted = wasmExports['lc'];\n  _emwgpuOnMapAsyncCompleted = wasmExports['mc'];\n  _emwgpuOnRequestAdapterCompleted = wasmExports['nc'];\n  _emwgpuOnRequestDeviceCompleted = wasmExports['oc'];\n  _emwgpuOnWorkDoneCompleted = wasmExports['pc'];\n  _emwgpuOnUncapturedError = wasmExports['qc'];\n  __emscripten_tls_init = wasmExports['rc'];\n  _pthread_self = wasmExports['sc'];\n  _emscripten_builtin_memalign = wasmExports['tc'];\n  __emscripten_thread_init = wasmExports['vc'];\n  __emscripten_thread_crashed = wasmExports['wc'];\n  __emscripten_run_js_on_main_thread = wasmExports['xc'];\n  __emscripten_thread_free_data = wasmExports['yc'];\n  __emscripten_thread_exit = wasmExports['zc'];\n  __emscripten_timeout = wasmExports['Ac'];\n  __emscripten_check_mailbox = wasmExports['Bc'];\n  _memalign = wasmExports['Cc'];\n  _setThrew = wasmExports['Dc'];\n  __emscripten_tempret_set = wasmExports['Ec'];\n  _emscripten_stack_set_limits = wasmExports['Fc'];\n  __emscripten_stack_restore = wasmExports['Gc'];\n  __emscripten_stack_alloc = wasmExports['Hc'];\n  _emscripten_stack_get_current = wasmExports['Ic'];\n  ___cxa_decrement_exception_refcount = wasmExports['Jc'];\n  ___cxa_increment_exception_refcount = wasmExports['Kc'];\n  ___cxa_can_catch = wasmExports['Lc'];\n  ___cxa_get_exception_ptr = wasmExports['Mc'];\n  dynCall_v = dynCalls['v'] = wasmExports['Nc'];\n  dynCall_ii = dynCalls['ii'] = wasmExports['Oc'];\n  dynCall_iii = dynCalls['iii'] = wasmExports['Pc'];\n  dynCall_vi = dynCalls['vi'] = wasmExports['Qc'];\n  dynCall_viii = dynCalls['viii'] = wasmExports['Rc'];\n  dynCall_viiiii = dynCalls['viiiii'] = wasmExports['Sc'];\n  dynCall_vii = dynCalls['vii'] = wasmExports['Tc'];\n  dynCall_iiiiiii = dynCalls['iiiiiii'] = wasmExports['Uc'];\n  dynCall_iiiii = dynCalls['iiiii'] = wasmExports['Vc'];\n  dynCall_iiiiii = dynCalls['iiiiii'] = wasmExports['Wc'];\n  dynCall_viiiiii = dynCalls['viiiiii'] = wasmExports['Xc'];\n  dynCall_vij = dynCalls['vij'] = wasmExports['Yc'];\n  dynCall_jii = dynCalls['jii'] = wasmExports['Zc'];\n  dynCall_viiii = dynCalls['viiii'] = wasmExports['_c'];\n  dynCall_iiii = dynCalls['iiii'] = wasmExports['$c'];\n  dynCall_iiiiiiii = dynCalls['iiiiiiii'] = wasmExports['ad'];\n  dynCall_iifff = dynCalls['iifff'] = wasmExports['bd'];\n  dynCall_iiiffiiii = dynCalls['iiiffiiii'] = wasmExports['cd'];\n  dynCall_ifi = dynCalls['ifi'] = wasmExports['dd'];\n  dynCall_iiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiii'] = wasmExports['ed'];\n  dynCall_iiiiiiiii = dynCalls['iiiiiiiii'] = wasmExports['fd'];\n  dynCall_iiiiiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiiiiii'] =\n    wasmExports['gd'];\n  dynCall_iiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiii'] = wasmExports['hd'];\n  dynCall_iij = dynCalls['iij'] = wasmExports['id'];\n  dynCall_iiiiff = dynCalls['iiiiff'] = wasmExports['jd'];\n  dynCall_viijj = dynCalls['viijj'] = wasmExports['kd'];\n  dynCall_iiif = dynCalls['iiif'] = wasmExports['ld'];\n  dynCall_iiiiiiiiiiii = dynCalls['iiiiiiiiiiii'] = wasmExports['md'];\n  dynCall_viif = dynCalls['viif'] = wasmExports['nd'];\n  dynCall_viid = dynCalls['viid'] = wasmExports['od'];\n  dynCall_iiijj = dynCalls['iiijj'] = wasmExports['pd'];\n  dynCall_iiijjjj = dynCalls['iiijjjj'] = wasmExports['qd'];\n  dynCall_iiiiiiiiiffffffi = dynCalls['iiiiiiiiiffffffi'] = wasmExports['rd'];\n  dynCall_i = dynCalls['i'] = wasmExports['sd'];\n  dynCall_iiij = dynCalls['iiij'] = wasmExports['td'];\n  dynCall_ji = dynCalls['ji'] = wasmExports['ud'];\n  dynCall_iiiiiiiiii = dynCalls['iiiiiiiiii'] = wasmExports['vd'];\n  dynCall_j = dynCalls['j'] = wasmExports['wd'];\n  dynCall_viiiijjji = dynCalls['viiiijjji'] = wasmExports['xd'];\n  dynCall_iiiiiiiiiifi = dynCalls['iiiiiiiiiifi'] = wasmExports['yd'];\n  dynCall_iiiiiiiiiiiijjiifiiiiiii = dynCalls['iiiiiiiiiiiijjiifiiiiiii'] =\n    wasmExports['zd'];\n  dynCall_iiiiiiiiiiiiiiii = dynCalls['iiiiiiiiiiiiiiii'] = wasmExports['Ad'];\n  dynCall_iiijjj = dynCalls['iiijjj'] = wasmExports['Bd'];\n  dynCall_iiiiiiiiifi = dynCalls['iiiiiiiiifi'] = wasmExports['Cd'];\n  dynCall_iiiff = dynCalls['iiiff'] = wasmExports['Dd'];\n  dynCall_iiiiiiji = dynCalls['iiiiiiji'] = wasmExports['Ed'];\n  dynCall_iiiiijiiijjjjjjj = dynCalls['iiiiijiiijjjjjjj'] = wasmExports['Fd'];\n  dynCall_viiiiiiiii = dynCalls['viiiiiiiii'] = wasmExports['Gd'];\n  dynCall_vj = dynCalls['vj'] = wasmExports['Hd'];\n  dynCall_viijii = dynCalls['viijii'] = wasmExports['Id'];\n  dynCall_viijijj = dynCalls['viijijj'] = wasmExports['Jd'];\n  dynCall_viiiij = dynCalls['viiiij'] = wasmExports['Kd'];\n  dynCall_viiij = dynCalls['viiij'] = wasmExports['Ld'];\n  dynCall_viiiiiii = dynCalls['viiiiiii'] = wasmExports['Md'];\n  dynCall_iiid = dynCalls['iiid'] = wasmExports['Nd'];\n  dynCall_jiji = dynCalls['jiji'] = wasmExports['Od'];\n  dynCall_iidiiii = dynCalls['iidiiii'] = wasmExports['Pd'];\n  dynCall_iiiij = dynCalls['iiiij'] = wasmExports['Qd'];\n  dynCall_iiiiij = dynCalls['iiiiij'] = wasmExports['Rd'];\n  dynCall_jiiii = dynCalls['jiiii'] = wasmExports['Sd'];\n  dynCall_fiii = dynCalls['fiii'] = wasmExports['Td'];\n  dynCall_diii = dynCalls['diii'] = wasmExports['Ud'];\n  dynCall_viiiiiiiiii = dynCalls['viiiiiiiiii'] = wasmExports['Vd'];\n  dynCall_viiiiiiiiiiiiiii = dynCalls['viiiiiiiiiiiiiii'] = wasmExports['Wd'];\n  dynCall_viij = dynCalls['viij'] = wasmExports['Xd'];\n  dynCall_viiiiiiii = dynCalls['viiiiiiii'] = wasmExports['Yd'];\n  dynCall_viji = dynCalls['viji'] = wasmExports['Zd'];\n  dynCall_iiiiid = dynCalls['iiiiid'] = wasmExports['_d'];\n  dynCall_iiiiijj = dynCalls['iiiiijj'] = wasmExports['$d'];\n  dynCall_iiiiiijj = dynCalls['iiiiiijj'] = wasmExports['ae'];\n  _asyncify_start_unwind = wasmExports['be'];\n  _asyncify_stop_unwind = wasmExports['ce'];\n  _asyncify_start_rewind = wasmExports['de'];\n  _asyncify_stop_rewind = wasmExports['ee'];\n  __indirect_function_table = wasmTable = wasmExports['uc'];\n}\nvar wasmImports;\nfunction assignWasmImports() {\n  wasmImports = {\n    w: ___cxa_begin_catch,\n    Ha: ___cxa_current_primary_exception,\n    F: ___cxa_end_catch,\n    b: ___cxa_find_matching_catch_2,\n    n: ___cxa_find_matching_catch_3,\n    K: ___cxa_find_matching_catch_4,\n    ba: ___cxa_rethrow,\n    Ga: ___cxa_rethrow_primary_exception,\n    x: ___cxa_throw,\n    Ia: ___cxa_uncaught_exceptions,\n    Qa: ___pthread_create_js,\n    i: ___resumeException,\n    ja: ___syscall_fcntl64,\n    Fa: ___syscall_getcwd,\n    Ja: ___syscall_getdents64,\n    ab: ___syscall_ioctl,\n    ka: ___syscall_openat,\n    Ea: ___syscall_stat64,\n    gb: __abort_js,\n    Ya: __emscripten_init_main_thread_js,\n    La: __emscripten_notify_mailbox_postmessage,\n    Ra: __emscripten_receive_on_main_thread_js,\n    Aa: __emscripten_runtime_keepalive_clear,\n    ga: __emscripten_thread_cleanup,\n    Wa: __emscripten_thread_mailbox_await,\n    db: __emscripten_thread_set_strongref,\n    Sa: __mmap_js,\n    Ta: __munmap_js,\n    Ba: __setitimer_js,\n    Ua: __tzset_js,\n    fb: _clock_time_get,\n    ha: _emscripten_check_blocking_allowed,\n    eb: _emscripten_date_now,\n    bb: _emscripten_exit_with_live_runtime,\n    Ma: _emscripten_get_heap_max,\n    V: _emscripten_get_now,\n    hb: _emscripten_has_asyncify,\n    Na: _emscripten_num_logical_cores,\n    Ka: _emscripten_resize_heap,\n    lb: _emwgpuAdapterRequestDevice,\n    N: _emwgpuBufferDestroy,\n    pb: _emwgpuBufferGetConstMappedRange,\n    ob: _emwgpuBufferMapAsync,\n    nb: _emwgpuBufferUnmap,\n    m: _emwgpuDelete,\n    R: _emwgpuDeviceCreateBuffer,\n    la: _emwgpuDeviceCreateShaderModule,\n    mb: _emwgpuDeviceDestroy,\n    kb: _emwgpuInstanceRequestAdapter,\n    jb: _emwgpuQueueOnSubmittedWorkDone,\n    ib: _emwgpuWaitAny,\n    Za: _environ_get,\n    _a: _environ_sizes_get,\n    Pa: _exit,\n    X: _fd_close,\n    ia: _fd_read,\n    Va: _fd_seek,\n    $a: _fd_write,\n    ma: invoke_diii,\n    na: invoke_fiii,\n    G: invoke_i,\n    sa: invoke_ifi,\n    c: invoke_ii,\n    wa: invoke_iifff,\n    e: invoke_iii,\n    oa: invoke_iiid,\n    y: invoke_iiif,\n    Fb: invoke_iiiff,\n    fa: invoke_iiiffiiii,\n    g: invoke_iiii,\n    ra: invoke_iiiiff,\n    k: invoke_iiiii,\n    r: invoke_iiiiii,\n    j: invoke_iiiiiii,\n    J: invoke_iiiiiiii,\n    Q: invoke_iiiiiiiii,\n    p: invoke_iiiiiiiiiffffffi,\n    da: invoke_iiiiiiiiifi,\n    C: invoke_iiiiiiiiii,\n    t: invoke_iiiiiiiiiifi,\n    E: invoke_iiiiiiiiiiii,\n    va: invoke_iiiiiiiiiiiiii,\n    T: invoke_iiiiiiiiiiiiiii,\n    s: invoke_iiiiiiiiiiiiiiii,\n    ua: invoke_iiiiiiiiiiiiiiiiii,\n    A: invoke_iiiiiiiiiiiijjiifiiiiiii,\n    qa: invoke_iiiiiiji,\n    Ab: invoke_iiiiij,\n    ca: invoke_iiiiijiiijjjjjjj,\n    Bb: invoke_iiiij,\n    P: invoke_iiij,\n    B: invoke_iiijj,\n    v: invoke_iiijjj,\n    D: invoke_iiijjjj,\n    U: invoke_iij,\n    Cb: invoke_j,\n    O: invoke_ji,\n    W: invoke_jii,\n    Z: invoke_jiiii,\n    f: invoke_v,\n    q: invoke_vi,\n    l: invoke_vii,\n    xb: invoke_viid,\n    yb: invoke_viif,\n    h: invoke_viii,\n    o: invoke_viiii,\n    d: invoke_viiiii,\n    M: invoke_viiiiii,\n    I: invoke_viiiiiii,\n    aa: invoke_viiiiiiiii,\n    S: invoke_viiiiiiiiii,\n    Y: invoke_viiiiiiiiiiiiiii,\n    L: invoke_viiiij,\n    u: invoke_viiiijjji,\n    _: invoke_viiij,\n    pa: invoke_viijii,\n    Eb: invoke_viijijj,\n    ta: invoke_viijj,\n    H: invoke_vij,\n    $: invoke_vj,\n    z: _llvm_eh_typeid_for,\n    a: wasmMemory,\n    za: _proc_exit,\n    Ca: _random_get,\n    Oa: _wgpuAdapterGetFeatures,\n    Xa: _wgpuAdapterGetInfo,\n    cb: _wgpuAdapterGetLimits,\n    Da: _wgpuAdapterHasFeature,\n    xa: _wgpuBufferGetSize,\n    zb: _wgpuCommandEncoderBeginComputePass,\n    qb: _wgpuCommandEncoderCopyBufferToBuffer,\n    sb: _wgpuCommandEncoderFinish,\n    ub: _wgpuComputePassEncoderDispatchWorkgroups,\n    tb: _wgpuComputePassEncoderEnd,\n    vb: _wgpuComputePassEncoderSetBindGroup,\n    wb: _wgpuComputePassEncoderSetPipeline,\n    Hb: _wgpuComputePipelineGetBindGroupLayout,\n    Gb: _wgpuDeviceCreateBindGroup,\n    Db: _wgpuDeviceCreateCommandEncoder,\n    ya: _wgpuDeviceCreateComputePipeline,\n    rb: _wgpuQueueSubmit,\n    ea: _wgpuQueueWriteBuffer,\n  };\n}\nfunction invoke_v(index) {\n  var sp = stackSave();\n  try {\n    dynCall_v(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_iii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ii(index, a1) {\n  var sp = stackSave();\n  try {\n    return dynCall_ii(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    dynCall_vii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiii(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vi(index, a1) {\n  var sp = stackSave();\n  try {\n    dynCall_vi(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiii(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiii(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_jii(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_jii(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_viiii(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viiii(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vij(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    dynCall_vij(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iifff(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iifff(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiffiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiffiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiii(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iij(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_iij(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15,\n  a16,\n  a17\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15,\n      a16,\n      a17\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiif(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiif(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijj(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viijj(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijj(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijj(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijjjj(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijjjj(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiffffffi(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiffffffi(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_i(index) {\n  var sp = stackSave();\n  try {\n    return dynCall_i(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiij(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiij(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ji(index, a1) {\n  var sp = stackSave();\n  try {\n    return dynCall_ji(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_ifi(index, a1, a2) {\n  var sp = stackSave();\n  try {\n    return dynCall_ifi(index, a1, a2);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiff(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiff(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiijjji(index, a1, a2, a3, a4, a5, a6, a7, a8) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiijjji(index, a1, a2, a3, a4, a5, a6, a7, a8);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiifi(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiifi(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiijjiifiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15,\n  a16,\n  a17,\n  a18,\n  a19,\n  a20,\n  a21,\n  a22,\n  a23\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiijjiifiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15,\n      a16,\n      a17,\n      a18,\n      a19,\n      a20,\n      a21,\n      a22,\n      a23\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiijjj(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiijjj(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiiiifi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiiiifi(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiff(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiff(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiiiji(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiiiji(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiijiiijjjjjjj(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiijiiijjjjjjj(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_vj(index, a1) {\n  var sp = stackSave();\n  try {\n    dynCall_vj(index, a1);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijijj(index, a1, a2, a3, a4, a5, a6) {\n  var sp = stackSave();\n  try {\n    dynCall_viijijj(index, a1, a2, a3, a4, a5, a6);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viijii(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viijii(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiij(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiij(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiij(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    dynCall_viiij(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiid(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiid(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_j(index) {\n  var sp = stackSave();\n  try {\n    return dynCall_j(index);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_iiiij(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiij(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_iiiiij(index, a1, a2, a3, a4, a5) {\n  var sp = stackSave();\n  try {\n    return dynCall_iiiiij(index, a1, a2, a3, a4, a5);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_jiiii(index, a1, a2, a3, a4) {\n  var sp = stackSave();\n  try {\n    return dynCall_jiiii(index, a1, a2, a3, a4);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n    return 0n;\n  }\n}\nfunction invoke_fiii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_fiii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_diii(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    return dynCall_diii(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viiiiiiiiiiiiiii(\n  index,\n  a1,\n  a2,\n  a3,\n  a4,\n  a5,\n  a6,\n  a7,\n  a8,\n  a9,\n  a10,\n  a11,\n  a12,\n  a13,\n  a14,\n  a15\n) {\n  var sp = stackSave();\n  try {\n    dynCall_viiiiiiiiiiiiiii(\n      index,\n      a1,\n      a2,\n      a3,\n      a4,\n      a5,\n      a6,\n      a7,\n      a8,\n      a9,\n      a10,\n      a11,\n      a12,\n      a13,\n      a14,\n      a15\n    );\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viif(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viif(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction invoke_viid(index, a1, a2, a3) {\n  var sp = stackSave();\n  try {\n    dynCall_viid(index, a1, a2, a3);\n  } catch (e) {\n    stackRestore(sp);\n    if (e !== e + 0) throw e;\n    _setThrew(1, 0);\n  }\n}\nfunction applySignatureConversions(wasmExports) {\n  wasmExports = Object.assign({}, wasmExports);\n  var makeWrapper_pp = (f) => (a0) => f(a0) >>> 0;\n  var makeWrapper_p = (f) => () => f() >>> 0;\n  var makeWrapper_ppp = (f) => (a0, a1) => f(a0, a1) >>> 0;\n  wasmExports['Pb'] = makeWrapper_pp(wasmExports['Pb']);\n  wasmExports['sc'] = makeWrapper_p(wasmExports['sc']);\n  wasmExports['tc'] = makeWrapper_ppp(wasmExports['tc']);\n  wasmExports['Cc'] = makeWrapper_ppp(wasmExports['Cc']);\n  wasmExports['Hc'] = makeWrapper_pp(wasmExports['Hc']);\n  wasmExports['Ic'] = makeWrapper_p(wasmExports['Ic']);\n  wasmExports['Mc'] = makeWrapper_pp(wasmExports['Mc']);\n  return wasmExports;\n}\nfunction callMain() {\n  var entryFunction = _main;\n  var argc = 0;\n  var argv = 0;\n  try {\n    var ret = entryFunction(argc, argv);\n    exitJS(ret, true);\n    return ret;\n  } catch (e) {\n    return handleException(e);\n  }\n}\nfunction run() {\n  if (runDependencies > 0) {\n    dependenciesFulfilled = run;\n    return;\n  }\n  if (ENVIRONMENT_IS_PTHREAD) {\n    initRuntime();\n    return;\n  }\n  preRun();\n  if (runDependencies > 0) {\n    dependenciesFulfilled = run;\n    return;\n  }\n  function doRun() {\n    Module['calledRun'] = true;\n    if (ABORT) return;\n    initRuntime();\n    preMain();\n    Module['onRuntimeInitialized']?.();\n    var noInitialRun = Module['noInitialRun'] || false;\n    if (!noInitialRun) callMain();\n    postRun();\n  }\n  if (Module['setStatus']) {\n    Module['setStatus']('Running...');\n    setTimeout(() => {\n      setTimeout(() => Module['setStatus'](''), 1);\n      doRun();\n    }, 1);\n  } else {\n    doRun();\n  }\n}\nvar wasmExports;\nif (!ENVIRONMENT_IS_PTHREAD) {\n  createWasm();\n  run();\n}\n";

// src/worker.ts
var ProxyToWorker = class {
  constructor(pathConfig, nbThread = 1, suppressNativeLog, logger) {
    __publicField(this, "logger");
    __publicField(this, "suppressNativeLog");
    __publicField(this, "taskQueue", []);
    __publicField(this, "taskId", 1);
    __publicField(this, "resultQueue", []);
    __publicField(this, "busy", false);
    // is the work loop is running?
    __publicField(this, "worker");
    __publicField(this, "pathConfig");
    __publicField(this, "multiThread");
    __publicField(this, "nbThread");
    this.pathConfig = pathConfig;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 1;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
  }
  async moduleInit(ggufFiles) {
    if (!this.pathConfig["wllama.wasm"]) {
      throw new Error('"wllama.wasm" is missing from pathConfig');
    }
    const buildType = this.pathConfig["wllama.buildType"];
    const isJspi = buildType === "jspi";
    const isAsyncify = buildType === "asyncify";
    if (!isJspi && !isAsyncify) {
      throw new Error('"wllama.buildType" must be either "jspi" or "asyncify"');
    }
    let moduleCode;
    if (this.multiThread) {
      if (isAsyncify) {
        moduleCode = WLLAMA_ASYNCIFY_MULTI_THREAD_CODE;
      } else {
        throw new Error(
          "Unknown multi-thread build type for provided wllama.wasm path"
        );
      }
    } else {
      if (isJspi) {
        moduleCode = WLLAMA_JSPI_SINGLE_THREAD_CODE;
      } else if (isAsyncify) {
        moduleCode = WLLAMA_ASYNCIFY_SINGLE_THREAD_CODE;
      } else {
        throw new Error(
          "Unknown single-thread build type for provided wllama.wasm path"
        );
      }
    }
    if (!moduleCode) {
      throw new Error(
        "Missing embedded worker code for the selected runtime. Rebuild the package with `npm run build:worker` and `npm run build:tsup`."
      );
    }
    let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
    const runOptions = {
      pathConfig: this.pathConfig,
      nbThread: this.nbThread
    };
    const completeCode = [
      `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
      `function wModuleInit() { ${mainModuleCode}; return Module; }`,
      LLAMA_CPP_WORKER_CODE
    ].join(";\n\n");
    this.worker = createWorker(completeCode);
    this.worker.onmessage = this.onRecvMsg.bind(this);
    this.worker.onerror = this.logger.error;
    const res = await this.pushTask({
      verb: "module.init",
      args: [new Blob([moduleCode], { type: "text/javascript" })],
      callbackId: this.taskId++
    });
    for (const file of ggufFiles) {
      if (file.opfsCacheName) {
        await this.opfsFileAlloc(file.name, file.opfsCacheName);
      } else if (file.blob) {
        const id = await this.fileAlloc(file.name, file.blob.size);
        await this.fileWrite(id, file.blob);
      }
    }
    return res;
  }
  async wllamaStart() {
    const result = await this.pushTask({
      verb: "wllama.start",
      args: [],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaAction(name, body) {
    const encodedMsg = glueSerialize(body);
    const result = await this.pushTask({
      verb: "wllama.action",
      args: [name, encodedMsg],
      callbackId: this.taskId++
    });
    const parsedResult = glueDeserialize(result);
    return parsedResult;
  }
  async wllamaExit() {
    if (this.worker) {
      const result = await this.pushTask({
        verb: "wllama.exit",
        args: [],
        callbackId: this.taskId++
      });
      this.parseResult(result);
      this.worker.terminate();
    }
  }
  async wllamaDebug() {
    const result = await this.pushTask({
      verb: "wllama.debug",
      args: [],
      callbackId: this.taskId++
    });
    return JSON.parse(result);
  }
  async registerFile(fileName, blob) {
    if (!fileName || blob.size === 0) {
      throw new Error("Runtime file must have a name and non-empty content");
    }
    const id = await this.fileAlloc(fileName, blob.size);
    await this.fileWrite(id, blob);
  }
  ///////////////////////////////////////
  /**
   * Open an OPFS sync handle for a cached model file and register it in MEMFS.
   * No data is streamed to the WASM heap; reads are served from disk.
   */
  async opfsFileAlloc(logicalName, opfsCacheName) {
    await this.pushTask({
      verb: "fs.opfs-alloc",
      args: [logicalName, opfsCacheName],
      callbackId: this.taskId++
    });
  }
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  async fileAlloc(fileName, size) {
    const result = await this.pushTask({
      verb: "fs.alloc",
      args: [fileName, size],
      callbackId: this.taskId++
    });
    return result.fileId;
  }
  /**
   * Write a Blob to heapfs
   */
  async fileWrite(fileId, blob) {
    const reader = blob.stream().getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const size = value.byteLength;
      await this.pushTask(
        {
          verb: "fs.write",
          args: [fileId, value, offset],
          callbackId: this.taskId++
        },
        // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
        [value.buffer]
      );
      offset += size;
    }
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new Error("Unknown error, please see console.log");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  async runTaskLoop() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    while (true) {
      const task = this.taskQueue.shift();
      if (!task) break;
      this.resultQueue.push(task);
      this.worker.postMessage(
        task.param,
        isSafariMobile() ? void 0 : {
          transfer: task.buffers ?? []
        }
      );
    }
    this.busy = false;
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      this.abort(args[0]);
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(
        new Error(
          `Received abort signal from llama.cpp; Message: ${text || "(empty)"}`
        )
      );
    }
  }
};

// src/cache-manager.ts
var PREFIX_METADATA = "__metadata__";
var POLYFILL_ETAG = "polyfill_for_older_version";
var CacheManager = class {
  /**
   * Convert a given URL into file name in cache.
   *
   * Format of the file name: `${hashSHA1(fullURL)}_${fileName}`
   */
  async getNameFromURL(url) {
    return await urlToFileName(url, "");
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  async write(name, stream, metadata) {
    this.writeMetadata(name, metadata);
    return await opfsWrite(name, stream);
  }
  async download(url, options = {}) {
    const worker = createWorker(OPFS_UTILS_WORKER_CODE);
    let aborted = false;
    if (options.signal) {
      aborted = options.signal.aborted;
      const mSignal = options.signal;
      mSignal.addEventListener("abort", () => {
        aborted = true;
        worker.postMessage({ action: "download-abort" });
      });
      delete options.signal;
    }
    const metadataFileName = await urlToFileName(url, PREFIX_METADATA);
    const filename = await urlToFileName(url, "");
    return await new Promise((resolve, reject) => {
      worker.postMessage({
        action: "download",
        url,
        filename,
        metadataFileName,
        options: { headers: options.headers, aborted }
      });
      worker.onmessage = (e) => {
        if (e.data.ok) {
          worker.terminate();
          resolve();
        } else if (e.data.err) {
          worker.terminate();
          reject(e.data.err);
        } else if (e.data.progress) {
          const progress = e.data.progress;
          options.progressCallback?.(progress);
        } else {
          reject(new Error("Unknown message from worker"));
          console.error("Unknown message from worker", e.data);
        }
      };
    });
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  async open(nameOrURL) {
    return await opfsOpen(nameOrURL);
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  async getSize(name) {
    return await opfsFileSize(name);
  }
  /**
   * Get metadata of a cached file
   */
  async getMetadata(name) {
    const stream = await opfsOpen(name, PREFIX_METADATA);
    const cachedSize = await this.getSize(name);
    if (!stream) {
      return cachedSize > 0 ? (
        // files created by older version of wllama doesn't have metadata, we will try to polyfill it
        {
          etag: POLYFILL_ETAG,
          originalSize: cachedSize,
          originalURL: ""
        }
      ) : (
        // if cached file not found, we don't have metadata at all
        null
      );
    }
    try {
      const meta = await new Response(stream).json();
      return meta;
    } catch (e) {
      return null;
    }
  }
  /**
   * List all files currently in cache
   */
  async list() {
    const cacheDir = await getCacheDir();
    const result = [];
    const metadataMap = {};
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && name.startsWith(PREFIX_METADATA)) {
        const stream = (await handler.getFile()).stream();
        const meta = await new Response(stream).json().catch((_) => null);
        metadataMap[name.replace(PREFIX_METADATA, "")] = meta;
      }
    }
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && !name.startsWith(PREFIX_METADATA)) {
        result.push({
          name,
          size: await handler.getFile().then((f) => f.size),
          metadata: metadataMap[name] || {
            // try to polyfill for old versions
            originalSize: (await handler.getFile()).size,
            originalURL: "",
            etag: ""
          }
        });
      }
    }
    return result;
  }
  /**
   * Clear all files currently in cache
   */
  async clear() {
    await this.deleteMany(() => true);
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  async delete(nameOrURL) {
    const name2 = await this.getNameFromURL(nameOrURL);
    await this.deleteMany(
      (entry) => entry.name === nameOrURL || entry.name === name2
    );
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  async deleteMany(predicate) {
    const cacheDir = await getCacheDir();
    const list = await this.list();
    for (const item of list) {
      if (predicate(item)) {
        await cacheDir.removeEntry(item.name);
        await cacheDir.removeEntry(`${PREFIX_METADATA}${item.name}`).catch(() => {
        });
      }
    }
  }
  /**
   * Write the metadata of the file to disk.
   *
   * This function is separated from `write()` for compatibility reason. In older version of wllama, there was no metadata for cached file, so when newer version of wllama loads a file created by older version, it will try to polyfill the metadata.
   */
  async writeMetadata(name, metadata) {
    const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
    await opfsWrite(name, blob.stream(), PREFIX_METADATA);
  }
};
var cache_manager_default = CacheManager;
async function opfsWrite(key, stream, prefix = "") {
  try {
    const fileName = await urlToFileName(key, prefix);
    const writable = await opfsWriteViaWorker(fileName);
    await writable.truncate(0);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
    }
    await writable.close();
  } catch (e) {
    console.error("opfsWrite", e);
  }
}
async function opfsOpen(originalURLOrName, prefix = "") {
  const getFileHandler = async (fname) => {
    try {
      const cacheDir = await getCacheDir();
      const fileHandler = await cacheDir.getFileHandle(fname);
      return await fileHandler.getFile();
    } catch (e) {
      return null;
    }
  };
  let handler = await getFileHandler(originalURLOrName);
  if (handler) {
    return handler;
  }
  const fileName = await urlToFileName(originalURLOrName, prefix);
  handler = await getFileHandler(fileName);
  return handler;
}
async function opfsFileSize(originalURL, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await urlToFileName(originalURL, prefix);
    const fileHandler = await cacheDir.getFileHandle(fileName);
    const file = await fileHandler.getFile();
    return file.size;
  } catch (e) {
    return -1;
  }
}
async function urlToFileName(url, prefix) {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(url)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hashHex}_${url.split("/").pop()}`;
}
async function getCacheDir() {
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle("cache", { create: true });
  return cacheDir;
}
async function opfsWriteViaWorker(fileName) {
  const worker = createWorker(OPFS_UTILS_WORKER_CODE);
  let pResolve;
  let pReject;
  worker.onmessage = (e) => {
    if (e.data.ok) pResolve(null);
    else if (e.data.err) pReject(e.data.err);
  };
  const workerExec = (data) => new Promise((resolve, reject) => {
    pResolve = resolve;
    pReject = reject;
    worker.postMessage(
      data,
      isSafariMobile() ? void 0 : {
        transfer: data.value ? [data.value.buffer] : []
      }
    );
  });
  await workerExec({ open: fileName });
  return {
    truncate: async () => {
    },
    write: (value) => workerExec({ value }),
    close: async () => {
      await workerExec({ done: true });
      worker.terminate();
    }
  };
}

// src/model-manager.ts
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var ModelValidationStatus = /* @__PURE__ */ ((ModelValidationStatus2) => {
  ModelValidationStatus2["VALID"] = "valid";
  ModelValidationStatus2["INVALID"] = "invalid";
  ModelValidationStatus2["DELETED"] = "deleted";
  return ModelValidationStatus2;
})(ModelValidationStatus || {});
var Model = class {
  constructor(modelManager, url, savedFiles) {
    __publicField(this, "modelManager");
    /**
     * URL to the GGUF file (in case it contains multiple shards, the URL should point to the first shard)
     *
     * This URL will be used to identify the model in the cache. There can't be 2 models with the same URL.
     */
    __publicField(this, "url");
    /**
     * Size in bytes (total size of all shards).
     *
     * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
     */
    __publicField(this, "size");
    /**
     * List of all shards in the cache, sorted by original URL (ascending order)
     */
    __publicField(this, "files");
    this.modelManager = modelManager;
    this.url = url;
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * Open and get a list of all shards as Blobs
   */
  async open() {
    if (this.size === -1) {
      throw new WllamaError(
        `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
        "load_error"
      );
    }
    const blobs = [];
    for (const file of this.files) {
      const blob = await this.modelManager.cacheManager.open(file.name);
      if (!blob) {
        throw new Error(
          `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
        );
      }
      blobs.push(blob);
    }
    return blobs;
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    const nbShards = ModelManager.parseModelUrl(this.url).length;
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbShards) {
      return "invalid" /* INVALID */;
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid" /* INVALID */;
      }
    }
    return "valid" /* VALID */;
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  async refresh(options = {}) {
    const urls = ModelManager.parseModelUrl(this.url);
    const works = urls.map((url, index) => ({
      url,
      index
    }));
    this.modelManager.logger.debug("Downloading model files:", urls);
    const nParallel = this.modelManager.params.parallelDownloads ?? DEFAULT_PARALLEL_DOWNLOADS;
    const totalSize = await this.getTotalDownloadSize(urls);
    const loadedSize = [];
    const worker = async () => {
      while (works.length > 0) {
        const w = works.shift();
        if (!w) break;
        await this.modelManager.cacheManager.download(w.url, {
          ...options,
          progressCallback: ({ loaded }) => {
            loadedSize[w.index] = loaded;
            options.progressCallback?.({
              loaded: sumArr(loadedSize),
              total: totalSize
            });
          }
        });
      }
    };
    const promises = [];
    for (let i = 0; i < nParallel; i++) {
      promises.push(worker());
      loadedSize.push(0);
    }
    await Promise.all(promises);
    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());
    this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
  }
  /**
   * Remove the model from the cache
   */
  async remove() {
    this.files = this.getAllFiles(await this.modelManager.cacheManager.list());
    await this.modelManager.cacheManager.deleteMany(
      (f) => !!this.files.find((file) => file.name === f.name)
    );
    this.size = -1;
  }
  getAllFiles(savedFiles) {
    const allUrls = new Set(ModelManager.parseModelUrl(this.url));
    const allFiles = [];
    for (const url of allUrls) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        throw new Error(`Model file not found: ${url}`);
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
    return allFiles;
  }
  async getTotalDownloadSize(urls) {
    const responses = await Promise.all(
      urls.map((url) => fetch(url, { method: "HEAD" }))
    );
    const sizes = responses.map(
      (res) => Number(res.headers.get("content-length") || "0")
    );
    return sumArr(sizes);
  }
};
var ModelManager = class _ModelManager {
  constructor(params = {}) {
    // The CacheManager singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "params");
    __publicField(this, "logger");
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = queryMatch?.[1] ?? "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  async getModels(opts = {}) {
    const cachedFiles = await this.cacheManager.list();
    let models = [];
    for (const file of cachedFiles) {
      const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
      const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
      if (isFirstShard) {
        models.push(new Model(this, file.metadata.originalURL, cachedFiles));
      }
    }
    if (!opts.includeInvalid) {
      models = models.filter(
        (m) => m.validate() === "valid" /* VALID */
      );
    }
    return models;
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  async downloadModel(url, options = {}) {
    if (!isValidGgufFile(url)) {
      throw new WllamaError(
        `Invalid model URL: ${url}; URL must ends with ".gguf"`,
        "download_error"
      );
    }
    const model = new Model(this, url, void 0);
    const validity = model.validate();
    if (validity !== "valid" /* VALID */) {
      await model.refresh(options);
    }
    return model;
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  async getModelOrDownload(url, options = {}) {
    const models = await this.getModels();
    const model = models.find((m) => m.url === url);
    if (model) {
      options.progressCallback?.({ loaded: model.size, total: model.size });
      return model;
    }
    return this.downloadModel(url, options);
  }
  /**
   * Remove all models from the cache
   */
  async clear() {
    await this.cacheManager.clear();
  }
};

// src/wllama.ts
var HF_MODEL_ID_REGEX = /^([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)$/;
var HF_MODEL_ID_REGEX_EXPLAIN = "Hugging Face model ID is incorrect. Only regular alphanumeric characters, '-', '.' and '_' supported";
var LoggerWithoutDebug = {
  ...console,
  debug: () => {
  }
};
var WllamaError = class extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    __publicField(this, "type");
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  constructor() {
    super("Operation aborted");
    __publicField(this, "name", "AbortError");
  }
};
var Wllama = class {
  constructor(pathConfig, wllamaConfig = {}) {
    // The CacheManager and ModelManager are singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "proxy", null);
    __publicField(this, "config");
    __publicField(this, "pathConfig");
    __publicField(this, "useMultiThread", false);
    __publicField(this, "useWebGPU", false);
    __publicField(this, "nbThreads", 1);
    __publicField(this, "useEmbeddings", false);
    // available when loaded
    __publicField(this, "loadedContextInfo", null);
    __publicField(this, "bosToken", -1);
    __publicField(this, "eosToken", -1);
    __publicField(this, "eotToken", -1);
    __publicField(this, "eogTokens", /* @__PURE__ */ new Set());
    __publicField(this, "addBosToken", false);
    __publicField(this, "addEosToken", false);
    __publicField(this, "chatTemplate");
    __publicField(this, "metadata");
    __publicField(this, "samplingConfig", {});
    __publicField(this, "hasEncoder", false);
    __publicField(this, "decoderStartToken", -1);
    __publicField(this, "nCachedTokens", 0);
    __publicField(this, "loraFileSequence", 0);
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = wllamaConfig.cacheManager ?? new cache_manager_default();
    this.modelManager = wllamaConfig.modelManager ?? new ModelManager({
      cacheManager: this.cacheManager,
      logger: wllamaConfig.logger ?? console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
  }
  logger() {
    return this.config.logger ?? console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.nbThreads;
  }
  usingWebGPU() {
    this.checkModelLoaded();
    return this.useWebGPU;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    this.checkModelLoaded();
    return this.chatTemplate ?? null;
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelUrl URL to the GGUF file. If the model is splitted, pass the URL to the first shard.
   * @param config
   */
  async loadModelFromUrl(modelUrl, config = {}) {
    const url = isString(modelUrl) ? modelUrl : modelUrl[0];
    const useCache = config.useCache ?? true;
    const model = useCache ? await this.modelManager.getModelOrDownload(url, config) : await this.modelManager.downloadModel(url, config);
    return await this.loadModel(model, config);
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param modelId The HF model ID, for example: 'ggml-org/models'
   * @param filePath The GGUF file path, for example: 'tinyllamas/stories15M-q4_0.gguf'
   * @param config
   */
  async loadModelFromHF(modelId, filePath, config = {}) {
    if (!modelId.match(HF_MODEL_ID_REGEX)) {
      throw new WllamaError(HF_MODEL_ID_REGEX_EXPLAIN, "download_error");
    }
    if (!isValidGgufFile(filePath)) {
      throw new WllamaError("Only GGUF file is supported", "download_error");
    }
    return await this.loadModelFromUrl(
      `https://huggingface.co/${modelId}/resolve/main/${filePath}`,
      config
    );
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param config LoadModelConfig
   */
  async loadModel(ggufBlobsOrModel, config = {}) {
    if (this.proxy) {
      throw new WllamaError("Module is already initialized", "load_error");
    }
    this.useWebGPU = this.config.backend === "webgpu";
    const useOpfsLoad = this.useWebGPU && ggufBlobsOrModel instanceof Model;
    let blobs = [];
    if (!useOpfsLoad) {
      blobs = ggufBlobsOrModel instanceof Model ? await ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
      if (blobs.some((b) => b.size === 0)) {
        throw new WllamaError(
          "Input model (or splits) must be non-empty Blob or File",
          "load_error"
        );
      }
      sortFileByShard(blobs);
    }
    const hasJspi = "Suspending" in WebAssembly;
    const hasMemory64 = hasJspi ? await isSupportMemory64() : false;
    const useJspi = hasJspi && hasMemory64;
    const multiThreadPath = this.pathConfig["asyncify/multi-thread/wllama.wasm"];
    const singleThreadPath = useJspi ? this.pathConfig["jspi/single-thread/wllama.wasm"] : this.pathConfig["asyncify/single-thread/wllama.wasm"];
    if (hasJspi && !hasMemory64) {
      this.logger().warn(
        "JSPI is available but Memory64 is not supported, falling back to asyncify single-thread"
      );
    }
    if (await isSupportMultiThread()) {
      if (multiThreadPath) {
        const hwConcurrency = Math.floor(
          (navigator.hardwareConcurrency || 1) / 2
        );
        this.nbThreads = config.n_threads ?? hwConcurrency;
        if (this.nbThreads > 1) {
          this.useMultiThread = true;
        } else {
          this.logger().warn(
            "Falling back single-thread due to n_threads configuration or limited hardware concurrency"
          );
        }
      } else {
        this.logger().warn(
          "Missing paths to multi-thread build, falling back to single-thread"
        );
      }
    } else {
      this.logger().warn(
        "Multi-threads are not supported in this environment, falling back to single-thread"
      );
    }
    if (this.useWebGPU) {
      this.logger().warn("Disabling multi-threading when using WebGPU backend");
      this.useMultiThread = false;
      this.nbThreads = 1;
    }
    const mPathConfig = this.useMultiThread ? {
      "wllama.wasm": absoluteUrl(multiThreadPath),
      "wllama.buildType": "asyncify",
      "wllama.useWebGPU": this.useWebGPU
    } : {
      "wllama.wasm": absoluteUrl(singleThreadPath),
      "wllama.buildType": useJspi ? "jspi" : "asyncify",
      "wllama.memory64": useJspi,
      "wllama.useWebGPU": this.useWebGPU
    };
    this.proxy = new ProxyToWorker(
      mPathConfig,
      this.nbThreads,
      this.config.suppressNativeLog ?? false,
      this.logger()
    );
    const modelFiles = useOpfsLoad ? ggufBlobsOrModel.files.map((f, i) => ({
      name: `model-${i}.gguf`,
      opfsCacheName: f.name
    })) : blobs.map((blob, i) => ({ name: `model-${i}.gguf`, blob }));
    await this.proxy.moduleInit(modelFiles);
    const startResult = await this.proxy.wllamaStart();
    if (!startResult.success) {
      throw new WllamaError(
        `Error while calling start function, result = ${startResult}`
      );
    }
    const loadResult = await this.proxy.wllamaAction("load", {
      _name: "load_req",
      use_mmap: !useOpfsLoad,
      // OPFS path uses fread, which calls the overriden read handle; heap path can use mmap
      use_mlock: !useOpfsLoad,
      // nothing to mlock on WASM heap when using OPFS
      use_webgpu: this.useWebGPU,
      n_gpu_layers: this.useWebGPU ? 999 : 0,
      no_perf: this.config.noPerf ?? false,
      seed: config.seed || Math.floor(Math.random() * 1e5),
      n_ctx: config.n_ctx || 1024,
      n_threads: this.nbThreads,
      n_ctx_auto: false,
      // not supported for now
      model_paths: modelFiles.map((f) => `models/${f.name}`),
      embeddings: config.embeddings,
      offload_kqv: config.offload_kqv,
      n_batch: config.n_batch,
      pooling_type: config.pooling_type,
      rope_scaling_type: config.rope_scaling_type,
      rope_freq_base: config.rope_freq_base,
      rope_freq_scale: config.rope_freq_scale,
      yarn_ext_factor: config.yarn_ext_factor,
      yarn_attn_factor: config.yarn_attn_factor,
      yarn_beta_fast: config.yarn_beta_fast,
      yarn_beta_slow: config.yarn_beta_slow,
      yarn_orig_ctx: config.yarn_orig_ctx,
      cache_type_k: config.cache_type_k,
      cache_type_v: config.cache_type_v,
      n_seq_max: 1,
      // only support single sequence for now
      flash_attn: config.flash_attn,
      swa_full: true
      // TODO: properly support SWA
    });
    const loadedCtxInfo = {
      ...loadResult,
      metadata: {}
    };
    for (let i = 0; i < loadResult.metadata_key.length; i++) {
      loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
    }
    this.bosToken = loadedCtxInfo.token_bos;
    this.eosToken = loadedCtxInfo.token_eos;
    this.eotToken = loadedCtxInfo.token_eot;
    this.useEmbeddings = !!config.embeddings;
    this.metadata = {
      hparams: {
        nVocab: loadedCtxInfo.n_vocab,
        nCtxTrain: loadedCtxInfo.n_ctx_train,
        nEmbd: loadedCtxInfo.n_embd,
        nLayer: loadedCtxInfo.n_layer
      },
      meta: loadedCtxInfo.metadata
    };
    this.hasEncoder = !!loadedCtxInfo.has_encoder;
    this.decoderStartToken = loadedCtxInfo.token_decoder_start;
    this.addBosToken = loadedCtxInfo.add_bos_token;
    this.addEosToken = loadedCtxInfo.add_eos_token;
    this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
    this.loadedContextInfo = loadedCtxInfo;
    this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
    this.logger().debug({ loadedCtxInfo });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return { ...this.loadedContextInfo };
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param text Input text
   * @returns An embedding vector
   */
  async createEmbedding(text, options = {}) {
    this.checkModelLoaded();
    const opt = {
      skipBOS: false,
      skipEOS: false,
      ...options
    };
    await this.samplingInit(this.samplingConfig);
    await this.kvClear();
    const tokens = await this.tokenize(text);
    if (this.bosToken && !opt.skipBOS) {
      tokens.unshift(this.bosToken);
    }
    if (this.eosToken && !opt.skipEOS) {
      tokens.push(this.eosToken);
    }
    const result = await this.embeddings(tokens);
    return result;
  }
  async createChatCompletion(messages, options) {
    const prompt = await this.formatChat(messages, true);
    return options.stream ? await this.createCompletionGenerator(prompt, options) : await this.createCompletion(prompt, { ...options, stream: false });
  }
  async createCompletion(prompt, options) {
    return options.stream ? await this.createCompletionGenerator(prompt, options) : await this.createCompletionImpl(prompt, { ...options, stream: false });
  }
  /**
   * Private implementation of createCompletion
   */
  async createCompletionImpl(prompt, options) {
    this.checkModelLoaded();
    this.samplingConfig = options.sampling ?? {};
    await this.samplingInit(this.samplingConfig);
    const stopTokens = new Set(options.stopTokens ?? []);
    let tokens = await this.tokenize(prompt, true);
    if (this.addBosToken && tokens[0] !== this.bosToken) {
      tokens.unshift(this.bosToken);
    }
    if (options.useCache) {
      tokens = await this.computeNonCachedTokens(tokens);
    } else {
      await this.kvClear();
    }
    await this.samplingAccept(tokens);
    if (this.isEncoderDecoderArchitecture()) {
      await this.encode(tokens);
      await this.decode([this.getDecoderStartToken()], {});
    } else {
      await this.decode(tokens, {});
    }
    let outBuf = new Uint8Array();
    let abort = false;
    const abortSignalFn = () => {
      abort = true;
    };
    for (let i = 0; i < (options.nPredict ?? Infinity); i++) {
      const sampled = await this.samplingSample();
      if (this.isTokenEOG(sampled.token) || stopTokens.has(sampled.token)) {
        break;
      }
      outBuf = joinBuffers([outBuf, sampled.piece]);
      if (options.onNewToken) {
        options.onNewToken(sampled.token, sampled.piece, bufToText(outBuf), {
          abortSignal: abortSignalFn
          // legacy
        });
      }
      if (abort || options.abortSignal?.aborted) {
        break;
      }
      await this.samplingAccept([sampled.token]);
      await this.decode([sampled.token], {});
    }
    return bufToText(outBuf);
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   */
  createCompletionGenerator(prompt, options) {
    return new Promise((resolve, reject) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl(prompt, {
            ...options,
            onNewToken: (token, piece, currentText) => {
              callback({ token, piece, currentText }, false);
            }
          }).catch(reject).then(() => {
            callback(void 0, true);
          });
        }
      );
      resolve(createGenerator());
    });
  }
  //////////////////////////////////////////////
  // Low level API
  /**
   * Create or reset the ctx_sampling
   * @param config
   * @param pastTokens In case re-initializing the ctx_sampling, you can re-import past tokens into the new context
   */
  async samplingInit(config, pastTokens = []) {
    this.checkModelLoaded();
    this.samplingConfig = config;
    const logitBias = config.logit_bias ?? [];
    const logitBiasTok = logitBias.map((b) => b.token);
    const logitBiasVal = logitBias.map((b) => b.bias);
    const result = await this.proxy.wllamaAction(
      "sampling_init",
      {
        _name: "sint_req",
        ...config,
        logit_bias_toks: logitBiasTok,
        logit_bias_vals: logitBiasVal,
        tokens: pastTokens
      }
    );
    if (!result.success) {
      throw new WllamaError("Failed to initialize sampling");
    }
  }
  /**
   * Get a list of pieces in vocab.
   * NOTE: This function is slow, should only be used once.
   * @returns A list of Uint8Array. The nth element in the list associated to nth token in vocab
   */
  async getVocab() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "get_vocab",
      {
        _name: "gvoc_req"
      }
    );
    return result.vocab;
  }
  /**
   * Lookup to see if a token exist in vocab or not. Useful for searching special tokens like "<|im_start|>"
   * NOTE: It will match the whole token, so do not use it as a replacement for tokenize()
   * @param piece
   * @returns Token ID associated to the given piece. Returns -1 if cannot find the token.
   */
  async lookupToken(piece) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "lookup_token",
      {
        _name: "lkup_req",
        piece
      }
    );
    if (!result.success) {
      return -1;
    } else {
      return result.token;
    }
  }
  /**
   * Convert a given text to list of tokens
   * @param text
   * @param special Should split special tokens?
   * @returns List of token ID
   */
  async tokenize(text, special = true) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "tokenize",
      {
        _name: "tokn_req",
        text,
        special: !!special
      }
    );
    return result.tokens;
  }
  async detokenize(tokens, returnString = false) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "detokenize",
      {
        _name: "dtkn_req",
        tokens
      }
    );
    return returnString ? bufToText(result.buffer) : result.buffer;
  }
  /**
   * Run llama_decode()
   * @param tokens A list of tokens to be decoded
   * @param options Additional options
   * @returns n_past (number of tokens so far in the sequence)
   */
  async decode(tokens, options) {
    this.checkModelLoaded();
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it."
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      if (options?.abortSignal?.aborted) {
        throw new WllamaAbortError();
      }
      const isNotLast = batches.length > 1 && i < batches.length - 1;
      result = await this.proxy.wllamaAction("decode", {
        _name: "deco_req",
        tokens: batches[i],
        skip_logits: options.skipLogits || isNotLast
      });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  /**
   * Run llama_encode()
   * @param tokens A list of tokens to be encoded
   * @param options Additional options
   * @returns n_past (number of tokens so far in the sequence)
   */
  async encode(tokens, options) {
    this.checkModelLoaded();
    if (!this.hasEncoder) {
      throw new WllamaError(
        "This model does not use encoder-decoder architecture.",
        "inference_error"
      );
    }
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it.",
        "inference_error"
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      if (options?.abortSignal?.aborted) {
        throw new WllamaAbortError();
      }
      result = await this.proxy.wllamaAction("encode", {
        _name: "enco_req",
        tokens: batches[i]
      });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  breakTokensIntoBatches(tokens, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < tokens.length; i += maxBatchSize) {
      batches.push(tokens.slice(i, i + maxBatchSize));
    }
    return batches;
  }
  /**
   * Sample a new token (remember to samplingInit() at least once before calling this function)
   * @returns the token ID and its detokenized value (which maybe an unfinished unicode)
   */
  async samplingSample() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "sampling_sample",
      {
        _name: "ssam_req"
      }
    );
    return {
      piece: result.piece,
      token: result.token
    };
  }
  /**
   * Accept and save a new token to ctx_sampling
   * @param tokens
   */
  async samplingAccept(tokens) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "sampling_accept",
      {
        _name: "sacc_req",
        tokens
      }
    );
    if (!result.success) {
      throw new WllamaError("samplingAccept unknown error");
    }
  }
  /**
   * Get softmax-ed probability of logits, can be used for custom sampling
   * @param topK Get top K tokens having highest logits value. If topK == -1, we return all n_vocab logits, but this is not recommended because it's slow.
   */
  async getLogits(topK = 40) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "get_logits",
      {
        _name: "glog_req",
        top_k: topK
      }
    );
    const logits = [];
    for (let i = 0; i < result.tokens.length; i++) {
      logits.push({
        token: result.tokens[i],
        p: result.probs[i]
      });
    }
    return logits;
  }
  /**
   * Calculate embeddings for a given list of tokens. Output vector is always normalized
   * @param tokens
   * @returns A list of number represents an embedding vector of N dimensions
   */
  async embeddings(tokens) {
    this.checkModelLoaded();
    if (!this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is disabled. Use wllama.setOptions({ embeddings: true }) to enable it.",
        "inference_error"
      );
    }
    if (this.nCachedTokens > 0) {
      this.logger().warn(
        "Embeddings: KV cache is not empty, this may produce incorrect results"
      );
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_batch) {
      throw new WllamaError(
        "Embedding tokens does not fit into batch. Please increase n_batch when loading the model",
        "inference_error"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_ubatch) {
      throw new WllamaError(
        "Embedding tokens does not fit into physical batch. Please increase n_ubatch when loading the model",
        "inference_error"
      );
    }
    const result = await this.proxy.wllamaAction(
      "embeddings",
      {
        _name: "gemb_req",
        tokens
      }
    );
    if (!result.success) {
      throw new WllamaError("embeddings unknown error");
    } else {
      return result.embeddings;
    }
  }
  /**
   * Remove and shift some tokens from KV cache.
   * Keep n_keep, remove n_discard then shift the rest
   * @param nKeep
   * @param nDiscard
   */
  async kvRemove(nKeep, nDiscard) {
    this.checkModelLoaded();
    if (nDiscard === 0) return;
    const result = await this.proxy.wllamaAction(
      "kv_remove",
      {
        _name: "kvcr_req",
        n_keep: nKeep,
        n_discard: nDiscard
      }
    );
    if (!result.success) {
      throw new WllamaError("kvRemove unknown error");
    }
    if (nDiscard < 0) {
      this.nCachedTokens = nKeep;
    } else {
      this.nCachedTokens -= nDiscard;
    }
  }
  /**
   * Clear all tokens in KV cache
   */
  async kvClear() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "kv_clear",
      {
        _name: "kvcc_req"
      }
    );
    if (!result.success) {
      throw new WllamaError("kvClear unknown error");
    }
    this.nCachedTokens = 0;
  }
  /**
   * Save session to file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   * @returns List of tokens saved to the file
   */
  // async sessionSave(filePath: string): Promise<{ tokens: number[] }> {
  //   this.checkModelLoaded();
  //   const result = await this.proxy.wllamaAction('session_save', {
  //     session_path: filePath,
  //   });
  //   return result;
  // }
  /**
   * Load session from file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   */
  // async sessionLoad(filePath: string): Promise<void> {
  //   this.checkModelLoaded();
  //   const result = await this.proxy.wllamaAction('session_load', {
  //     session_path: filePath,
  //   });
  //   if (result.error) {
  //     throw new WllamaError(result.error);
  //   } else if (!result.success) {
  //     throw new WllamaError('sessionLoad unknown error');
  //   }
  //   const cachedTokens = await this.getCachedTokens();
  //   this.nCachedTokens = cachedTokens.length;
  // }
  /**
   * Apply chat template to a list of messages
   *
   * @param messages list of messages
   * @param addAssistant whether to add assistant prompt at the end
   * @param template (optional) custom template, see llama-server --chat-template argument for more details
   * @returns formatted chat
   */
  async formatChat(messages, addAssistant, template) {
    this.checkModelLoaded();
    const roles = messages.map((m) => m.role);
    const contents = messages.map((m) => m.content);
    const result = await this.proxy.wllamaAction(
      "chat_format",
      {
        _name: "cfmt_req",
        roles,
        contents,
        tmpl: template,
        add_ass: addAssistant
      }
    );
    if (!result.success) {
      throw new WllamaError("formatChat unknown error");
    }
    return result.formatted_chat;
  }
  /**
   * Set options for underlaying llama_context
   */
  async setOptions(opt) {
    this.checkModelLoaded();
    await this.proxy.wllamaAction("set_options", {
      _name: "opti_req",
      ...opt
    });
    this.useEmbeddings = opt.embeddings;
  }
  /**
   * Load and apply a GGUF LoRA adapter to the active llama.cpp context.
   * Loading or clearing an adapter invalidates the KV cache in native code.
   */
  async loadLoraAdapter(adapter, scale = 1) {
    this.checkModelLoaded();
    if (!(adapter instanceof Blob) || adapter.size === 0) {
      throw new WllamaError(
        "LoRA adapter must be a non-empty Blob",
        "load_error"
      );
    }
    if (!Number.isFinite(scale) || Math.abs(scale) > 16) {
      throw new WllamaError(
        "LoRA scale must be finite and between -16 and 16",
        "load_error"
      );
    }
    const fileName = `adapter-${this.loraFileSequence++}.gguf`;
    await this.proxy.registerFile(fileName, adapter);
    const result = await this.proxy.wllamaAction(
      "lora_load",
      {
        _name: "lora_req",
        path: `models/${fileName}`,
        scale
      }
    );
    this.nCachedTokens = 0;
    return this.normalizeLoraStatus({ ...result, active: result.success });
  }
  async clearLoraAdapter() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "lora_clear",
      {
        _name: "lorc_req"
      }
    );
    if (!result.success)
      throw new WllamaError("Unable to clear LoRA adapter", "load_error");
    this.nCachedTokens = 0;
  }
  async getLoraAdapterStatus() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "lora_status",
      {
        _name: "lors_req"
      }
    );
    return this.normalizeLoraStatus(result);
  }
  normalizeLoraStatus(result) {
    const metadata = {};
    for (let index = 0; index < result.metadata_key.length; index++) {
      metadata[result.metadata_key[index]] = result.metadata_val[index];
    }
    return {
      active: result.active,
      path: result.path,
      scale: result.scale,
      metadata
    };
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  async exit() {
    await this.proxy?.wllamaExit();
    this.proxy = null;
  }
  /**
   * get debug info
   */
  async _getDebugInfo() {
    this.checkModelLoaded();
    return await this.proxy.wllamaDebug();
  }
  /**
   * Get llama.cpp performance counters for the current context.
   */
  async getPerfContext() {
    this.checkModelLoaded();
    return await this.proxy.wllamaAction(
      "perf_context",
      {
        _name: "pctx_req"
      }
    );
  }
  /**
   * Reset llama.cpp performance counters for the current context.
   */
  async resetPerfContext() {
    this.checkModelLoaded();
    return await this.proxy.wllamaAction("perf_reset", {
      _name: "prst_req"
    });
  }
  /**
   * benchmark function, only used internally
   */
  async _testBenchmark(type, nSamples) {
    this.checkModelLoaded();
    return await this.proxy.wllamaAction(
      "test_benchmark",
      {
        _name: "tben_req",
        type,
        n_samples: nSamples
      }
    );
  }
  /**
   * perplexity function, only used internally
   */
  async _testPerplexity(tokens) {
    this.checkModelLoaded();
    return await this.proxy.wllamaAction(
      "test_perplexity",
      {
        _name: "tper_req",
        tokens
      }
    );
  }
  ///// Prompt cache utils /////
  async getCachedTokens() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "current_status",
      {
        _name: "stat_req"
      }
    );
    return result.tokens;
  }
  /**
   * Compare the input sequence and cachedToken, then return the part that is not in cache.
   * This function also remove mismatch part in cache (via kvRemove)
   */
  async computeNonCachedTokens(seq) {
    const cachedTokens = await this.getCachedTokens();
    let nKeep = 0;
    for (; nKeep < Math.min(cachedTokens.length, seq.length); nKeep++) {
      if (cachedTokens[nKeep] !== seq[nKeep]) {
        break;
      }
    }
    this.logger().debug(`Cache nKeep=${nKeep}`);
    try {
      await this.kvRemove(nKeep, -1);
      return seq.slice(nKeep, seq.length);
    } catch (e) {
      this.logger().warn("Failed to rollback KV cache, clearing it instead");
      await this.kvClear();
      return seq;
    }
  }
  // TODO: add current_status
};
export {
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  isValidGgufFile
};
