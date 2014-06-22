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
    jsonrpc(msg.id, 'listunspent', [], function(data) {
          if (window.confirm("Authorize a transaction (" + msg.description + ") for " + msg.amount / 100000000 + "BTC?")) {
            var toSatoshi = function(i) {
              return (new BigNumber('' + i)).times(100000000).toNumber();
            }
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
                    return acc + toSatoshi(i.amount);
                  }, 0)
                  if (amount >= msg.amount) {
                    return acc
                  } else {
                    acc.push({txid: i.txid, vout: i.vout, address: i.address, scriptPubKey: i.scriptPubKey, amount: toSatoshi(i.amount), confirmations: i.confirmations})
                    return acc
                  }
                }, [])
              }
              var fee = 10000;
              var total = _.reduce(inputs, function(acc, i) { return acc + i.amount; }, 0);
              console.log(data.result, total, fee, msg.amount);
              var outputs = [{value: total - fee - msg.amount, scriptPubKey: Bitcoin.Address.fromBase58Check(inputs[0].address).toOutputScript().toHex()}]
              hash.update({inputs: inputs, outputs: outputs, random: random});
              var hashed = new Uint8Array(new Int32Array(hash.finalize()).buffer);
              port.postMessage({id: msg.id, data: {inputs: inputs, outputs: outputs, token: hashed, description: msg.description}});
           }
          }
        });
  }

  if (msg.command && msg.command == 'walletSignTransaction') {
    jsonrpc(msg.id, 'signrawtransaction', [msg.tx], function(data) {
          port.postMessage({id: msg.id, data: data.result.hex});
        });
  }

  if (msg.command && msg.command == 'walletBroadcastTransaction') {
    if (window.confirm("Broadcast transaction (" + msg.description + ") ?"))
    jsonrpc(msg.id, 'sendrawtransaction', [msg.tx], function(data) {
          port.postMessage({id: msg.id, data: data.result});
        });
  }

  });
});
