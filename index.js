const WebSocket = require('ws')
const { EventEmitter } = require('events')
const { TransactionFactory } = require('@ethereumjs/tx')
const {default:Common} = require('@ethereumjs/common')
class WsEth extends WebSocket {
	constructor(url) {
		super(url)
		this.requestQueue = new Map()
    this.statusEmitters = new Map()
    this.subscriptions = new Map()
    this.rpc_id = 0
    this.on('message', this.handleMessage)
    this.on('newHeads', this.handleNewBlock)
    this.common=null
	}
  call = (method, params, defaultBlock=0) => {
    if (this.readyState !== this.OPEN) {
      return new Promise( res => this.once('open', () => res(this.call(method,params,defaultBlock))))
    }
    const promise = new Promise((resolve,reject) => {
      const payload = {
        jsonrpc: '2.0',
        method,
        params: [
        ],
        id: ++this.rpc_id
      }
      params && (Array.isArray(params) ? payload.params.push(...params) : payload.params.push(params))
      defaultBlock && payload.params.push(defaultBlock)
      this.send(JSON.stringify(payload), err => {
        if (err) return reject(err)
      })
      this.requestQueue.set(this.rpc_id, {resolve,reject})
    })
    const emitter = new EventEmitter()
    promise._events = emitter._events;
    promise.emit = emitter.emit;
    promise.on = emitter.on;
    promise.once = emitter.once;
    promise.off = emitter.off;
    promise.listeners = emitter.listeners;
    promise.addListener = emitter.addListener;
    promise.removeListener = emitter.removeListener;
    promise.removeAllListeners = emitter.removeAllListeners;
    this.statusEmitters.set(this.rpc_id, emitter)
    return promise
  }
  subscribe = (name, cb=()=>{}) => {
    if (this.readyState !== this.OPEN) {
      return this.once('open', () => this.subscribe(name))
    }
    this.call("eth_subscribe", name)
    .then(result => {
      this.subscriptions.set(result, name)
      cb(false, result)
    })
    .catch(err => {
      this.emit('subError', err)
      cb(err)
    })
    return this
  }
  handleMessage = (data) => {
    if (!data.startsWith('{"jsonrpc')) return
    const message = JSON.parse(data)
    // event subscription
    if (message.method && message.method.indexOf('_subscription') !== -1) {
      const {subscription, result} = message.params
      this.emit(this.subscriptions.get(subscription), result);
      return
    }
    if (this.statusEmitters.has(message.id)) {
      const emitter = this.statusEmitters.get(message.id)
      emitter.emit('txHash', {txHash:message.result})
      if (/^0x([A-Fa-f0-9]{64})$/.test(message.result)) {
        emitter.txHash = message.result
      } else {
        emitter.emit('receipt', {error:new Error('Tx Hash was not received!')})
        this.statusEmitters.delete(message.id)
      }
    }
    const request = this.requestQueue.get(message.id)
    message.error ? request.reject(message.error) : request.resolve(message.result)
    
    this.requestQueue.delete(message.id)
  }
  handleNewBlock = (block) => {
    if (this.statusEmitters.size) {
      this.statusEmitters.forEach( (emitter, id) => {
        if (!emitter.listenerCount('receipt')) return 
        if (!emitter.txHash) return
        this.call('eth_getTransactionReceipt', emitter.txHash).then(receipt => {
          emitter.startBlock = emitter.startBlock || parseInt(block.number)
          const blocksSince = parseInt(block.number) - emitter.startBlock
          if (!receipt && blocksSince >= 50) {
            emitter.emit('receipt', {error:new Error('No receipt in 50 blocks for Tx: '+emitter.txHash)})
            this.statusEmitters.delete(id)
          } else if (receipt) {
            receipt.blocksSince = blocksSince
            emitter.emit('receipt', {receipt})
            this.statusEmitters.delete(id)
          }
        }).catch(error => {
          error.message = 'eth_getTransactionReceipt error: '+error.message
          emitter.emit('receipt', {error})
          this.statusEmitters.delete(id)
        })
      })
    }
  }
  setCommon = (chain) => {
    return this.common = chain 
      ? chain.customChain ? Common.custom(chain.customChain) 
      : new Common(chain) : null
  }
  signTransaction = (txData, privatekey, chain=null) => {
    const common = chain 
      ? chain.customChain ? Common.custom(chain.customChain) 
      : new Common(chain)
      : this.common
    const ethTx = TransactionFactory.fromTxData(txData, {common})
    const signedTx = ethTx.sign(Buffer.from(privatekey, 'hex'))
    const rlpEncoded = signedTx.serialize().toString('hex')
    const rawTransaction = '0x' + rlpEncoded;
    return rawTransaction
  }
}

module.exports = WsEth