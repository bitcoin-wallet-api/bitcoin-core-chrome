var random = sjcl.random.randomWords(1)[0];
var hash = new sjcl.hash.sha256()

chrome.storage.local.get(['rpc.host', 'rpc.username', 'rpc.password'], function(config) {
  if (_.isUndefined(config['rpc.host'])) {
    chrome.storage.local.set({'rpc.host': "localhost:8332"});
  }
  if (_.isUndefined(config['rpc.username']) || _.isUndefined(config['rpc.password'])) {
    window.open(chrome.extension.getURL("options.html"));
  }
});

var jsonrpc = function(id, method, params, cb, failure) {
  return chrome.storage.local.get(['rpc.host', 'rpc.username', 'rpc.password'], function(config) {
    $.ajax({
        type: 'POST',
        url: 'http://'+config['rpc.username']+':'+config['rpc.password']+'@'+config['rpc.host']+'/',
        data: JSON.stringify({'jsonrpc': '1.0', 'id': id, 'method': method, 'params': params}),
        success: function(data) {
          return cb(data);
        },
        failure: function(err) {
          return failure(err);
        },
        contentType: "application/json",
        dataType: 'json'
    });
  });
}

var verifyToken = function(tx, expiration, token, inputs, outputs, description) {
  var tokenInputs = _.map(inputs, function(i) { return {txid: i.txid, vout: i.vout, address: i.address}});
  var transaction = Bitcoin.Transaction.fromHex(tx);

  var inputsValidated = 0;
  transaction.ins.forEach(function(i) {
    var txid = Array.prototype.reverse.call(i.hash).toString('hex');
    tokenInputs.forEach(function(ti) {
      if (ti.txid == txid && ti.vout == i.index) {
         inputsValidated++;
      }
    });
  });


  var outputsValidated = 0;
  transaction.outs.forEach(function(o) {
    var scriptPubKey = o.script.toHex();
    outputs.forEach(function(out) {
      if (scriptPubKey == out.scriptPubKey && o.value == out.value) {
         outputsValidated++;
      }
    });
  });

  hash.update({inputs: tokenInputs, outputs: outputs, random: random, expiration: expiration, description: description});
  var newToken = new Uint8Array(new Int32Array(hash.finalize()).buffer);

  return _.isEqual(new Uint8Array(token), newToken) && inputsValidated == inputs.length && outputsValidated == outputs.length;

}


chrome.runtime.onConnect.addListener(function(port) {
  port.onMessage.addListener(function(msg) {

    if (msg.command && msg.command == 'getWallet') {

      if (window.confirm("Grant permission to securely access your Bitcoin wallet?")) {
        jsonrpc(msg.id, 'getinfo', [], function(data) {
              port.postMessage({id: msg.id, data: {agent: "Bitcoin Core/" + data.result.version, capabilities: {deterministic: false}}});
        });
      }

    }

  if (msg.command && msg.command == 'walletAuthorizeAmount') {
    jsonrpc(msg.id, 'listunspent', [0], function(data) {
          var expiration;

          if (_.isNull(msg.expiration) || msg.expiration > Date.now() + 3600000) { // more than one hour
            expiration = Date.now() + 3600000;
          } else {
            expiration = msg.expiration;
          }

          if (window.confirm("Authorize a transaction (" + msg.description + ") for " + msg.amount / 100000000 + "BTC until " + new Date(expiration) + "?")) {
            var toSatoshi = function(i) {
              return (new BigNumber('' + i)).times(100000000).toNumber();
            }
            var fee = 10000;
            var amount =  _.reduce(data.result, function(acc, i) {
              return acc + toSatoshi(i.amount);
            }, 0)
            if (amount < msg.amount) {
              alert('Insufficient funds to continue authorization of this transaction');
              port.postMessage({id: msg.id, data: {error: 101}});
            } else {
              var inputs;
              if (msg.amount == 0) {
                inputs = [data.result[0]]
                inputs[0].amount = toSatoshi(inputs[0].amount)
              } else {
                inputs = _.reduce(data.result, function(acc, i) {
                  var amount =  _.reduce(acc, function(acc, i) {
                    return acc + i.amount;
                  }, 0)
                  if (amount >= (msg.amount + fee)) {
                    return acc
                  } else {
                    acc.push({txid: i.txid, vout: i.vout, address: i.address, amount: toSatoshi(i.amount), confirmations: i.confirmations})
                    return acc
                  }
                }, [])
              }
              var total = _.reduce(inputs, function(acc, i) { return acc + i.amount; }, 0);
              var outputs = [{value: total - fee - msg.amount, scriptPubKey: Bitcoin.Address.fromBase58Check(inputs[0].address).toOutputScript().toHex()}]

              var tokenInputs = _.map(inputs, function(i) { return {txid: i.txid, vout: i.vout, address: i.address}});
              hash.update({inputs: tokenInputs, outputs: outputs, random: random, expiration: expiration, description: msg.description});
              var tokenTA = new Uint8Array(new Int32Array(hash.finalize()).buffer);
              var token = [];
              for (i=0;i<tokenTA.length;i++) {
                token[i] = tokenTA[i];
              }

              port.postMessage({id: msg.id, data: {inputs: inputs, outputs: outputs, token: token, expiration: expiration, description: msg.description}});
           }
          }
        });
  }

  if (msg.command && msg.command == 'walletSignTransaction') {
    jsonrpc(msg.id, 'signrawtransaction', [msg.tx], function(data) {
      if (verifyToken(msg.tx, msg.expiration, msg.token, msg.inputs, msg.outputs, msg.description)) {
        if (Date.now() > msg.expiration) {
          alert('Expired token, aborted transaction signing');
          port.postMessage({id: msg.id, data: {error: 202}});
        } else {
          port.postMessage({id: msg.id, data: data.result.hex});
        }
      } else {
        alert('Invalid token or transaction, aborted transaction signing');
        port.postMessage({id: msg.id, data: {error: 201}});
      }
    });
  }

  if (msg.command && msg.command == 'walletBroadcastTransaction') {
    if (window.confirm("Broadcast transaction (" + msg.description + ") ?"))
    jsonrpc(msg.id, 'sendrawtransaction', [msg.tx], function(data) {
      if (verifyToken(msg.tx, msg.expiration, msg.token, msg.inputs, msg.outputs, msg.description)) {
        if (Date.now() > msg.expiration) {
          alert('Expired token, aborted transaction broadcasting');
          port.postMessage({id: msg.id, data: {error: 202}});
        } else {
          port.postMessage({id: msg.id, data: data.result});
        }
      } else {
        alert('Invalid token or transaction, aborted transaction broadcasting');
        port.postMessage({id: msg.id, data: {error: 201}});
      }
    }, function (err) {
      alert(err.error.message);
      port.postMessage({id: msg.id, data: {error: 201, description: err.error.message}});
    });
  }

  });
});
