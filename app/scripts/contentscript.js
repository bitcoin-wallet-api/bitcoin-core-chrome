'use strict';

var bitcoin = function() {
    var ctr = 0;
    var cbs = {};
    var self = {};
    var msg = function(msg, cb) {
      ctr++;
      cbs[ctr] = cb
      msg.id = ctr
      window.postMessage(msg, "*");
    }
    var Input = function(i) {
      this.address = i.address;
      this.amount = i.amount;
      this.confirmations = i.confirmations;
      this.scriptPubKey = i.scriptPubKey;
      this.txid = i.txid;
      this.vout = i.vout;
      return this;
    }
    var Wallet = function(info) {
      this.capabilities = info.capabilities;
      this.agent = info.agent;
      return this;
    }
    Wallet.AUTHORIZATION_DENIED = 101;
    Wallet.prototype.authorizeAmount = function(amount,timeout,description,successCallback,failureCallback) {
      msg({command: "walletAuthorizeAmount", amount: amount, timeout: timeout, description: description}, function(data) {
        if (data.error) {
          failureCallback(data.error);
        } else {
          successCallback(new TransactionAuthorization(data.token, data.inputs.map(function(i) { return new Input(i); }), data.outputs, data.description));
        }
      })
    }
    var TransactionAuthorization = function(token, inputs, outputs, description) {
      this.token = token;
      this.inputs = inputs;
      this.outputs = outputs;
      this.description = description;
      return this;
    }
    TransactionAuthorization.prototype.sign = function(tx, successCallback, failureCallback) {
      msg({command: "walletSignTransaction", tx: tx, token: this.token}, function(data) {
        if (data.error) {
          failureCallback(data.error);
        } else {
          successCallback(data);
        }
      })
    }
    TransactionAuthorization.prototype.broadcast = function(tx, successCallback, failureCallback) {
      msg({command: "walletBroadcastTransaction", tx: tx, token: this.token, description: this.description}, function(data) {
        if (data.error) {
          failureCallback(data.error);
        } else {
          successCallback(data);
        }
      })
    }
    self.getWallet = function(cb) {
      msg({command: "getWallet"}, function(w) {
        cb(new Wallet(w))
      })
    };
    window.bitcoin = self;
    window.addEventListener("message", function(event) {
    if (event.data.command)
      return;
    cbs[event.data.id](event.data.data);
    }, false);
};

var code = '(' + bitcoin + ')();';

var port = chrome.runtime.connect();
port.onMessage.addListener(function(r) {
  window.postMessage(r, "*")
});

window.addEventListener("message", function(event) {
  // We only accept messages from ourselves
  if (event.source != window)
    return;
  if (!event.data.command)
    return;
  port.postMessage(event.data);
}, false);

document.documentElement.setAttribute('onreset', code);
document.documentElement.dispatchEvent(new CustomEvent('reset'));
document.documentElement.removeAttribute('onreset');
