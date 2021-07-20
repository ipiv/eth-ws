Simple Eth RPC-JSON Websocket client

# Get started
```js
const WsEth = require('eth-ws')
const wsEth = new WsEth('wss://mainnet.infura.io/ws/v3/YOUR-PROJECT-ID')

wsEth.call('eth_blockNumber')
  .then(blockNr => console.log(blockNr)) // parseInt(0x4b7) = 1207
```

Requests and responses are **[HEX encoded](https://eth.wiki/json-rpc/API#hex-value-encoding)**

# Real-time Events
Supports PubSub subscriptions\
<https://geth.ethereum.org/docs/rpc/pubsub>
```js
wsEth.subscribe('newHeads')

// Gets executed on every new block
wsEth.on('newHeads', (block) => {
  console.log('New block:', parseInt(block.number))
})
```

# Methods
<https://eth.wiki/json-rpc/API#json-rpc-methods>

```js
const gasPrice = await wsEth.call('eth_gasPrice')
console.log(gasPrice/1e9, 'Gwei')
```
```js
// or provide a callback to websocket `open` event
wsEth.on('open', async () => {
  console.log('WebSocket connection is now open!')
  const tx = await wsEth.call('eth_getTransactionByHash', TX_HASH)
  console.log(tx.from)
})

wsEth.on('error', err => console.error(err))
```

# Signing and Sending transactions
```js
// wsEth.setCommon({ chain: 'ropsten' })
const txData = {
  from: SENDER_ADDRESS
  to: RECEIVER_ADDRESS,
  gasPrice: '0x'+1e9.toString(16), // 1 Gwei
  value: '0x0', // 0
  nonce: await wsEth.call('eth_getTransactionCount', SENDER_ADDRESS, 'pending')
}
const rawTx = wsRpc.signTransaction(txData, PRIVATEKEY)

// Call returns a Promise combined with Event emitter

// 1) Using Promise for getting only the TransactionHash
const txHash = await wsEth.call('eth_sendRawTransaction', rawTransaction)
console.log('Transaction submitted:', txHash)
```
```js
// 2) Using event emitter for TransactionHash and Receipt

// Can use .once to receive Receipt just once, otherwise gets emitted on every new block confirmation
wsEth.call('eth_sendRawTransaction', rawTransaction)
  .once('txHash', txHash => console.log('Transaction submitted': txHash))
  .once('receipt', ({error, receipt}) => {
    if (error) return console.error(error)
    
    const {status, gasUsed, transactionHash, blocksSince} = receipt

    if (parseInt(status) === 0) {
      console.log('Transaction was submitted and mined but failed')
    } else {
      console.log('Transaction was successful')
    }
    
    console.log(`Transaction was confirmed in ${blocksSince} blocks`)
    console.log('Gas used by tx:', gasUsed)
  })

```

# Default block parameter
The following methods have an extra [Default Block parameter](https://eth.wiki/json-rpc/API#the-default-block-parameter):
- eth_getBalance
- eth_getCode
- eth_getTransactionCount
- eth_getStorageAt
- eth_call

`latest` | `pending` | `earliest` | `Block nr HEX string`

```js
wsEth.call('eth_getTransactionCount', ADDRESS, 'pending')
```
For example, executing smart-contract functions on **pending or past state** of blockchain:
```js
const abi = require('web3-eth-abi');
const contractABI = [{
    name: 'myMethod',
    type: 'function',
    inputs: [{
        type: 'uint256',
        name: 'myNumber'
    },{
        type: 'string',
        name: 'myString'
    }]
}]

// myMethod(2345675643, 'Hello!%')
const txParams = {
  to: CONTRACT_ADDRESS,
  from: SENDER_ADDRESS,
  data: abi.encodeFunctionCall(contractABI[0], ['2345675643', 'Hello!%']),
}

// pass defaultBlock - 'pending' or block number hex
wsEth.call('eth_estimateGas', txParams, 'pending')
  .then(gas => {
    console.log('Estimated gas required:', parseInt(gas))
    // "0x5208" -> 21000
  })
  .catch(err => {
    // for example 'execution reverted:'
    console.log(err.message)
  })
```

# Signing on Custom Chains and Testnets
You can either 
- pass the Chain common object to `signTransaction`
- or use `setCommon` to set it once for signing all future transactions
```js
wsEth.setCommon({ chain: 'ropsten' })
```
```js
wsEth.setCommon({ chain: 'ropsten', hardfork: 'byzantium' })
```
```js
wsEth.setCommon({ chain: 'ropsten', hardfork: 'byzantium' })
```
```js
wsEth.setCommon({
  customChain: {
    name: 'polygon-mainnet',
    chainId: 137,
    networkId: 137
  },
  baseChain: 'mainnet',
  hardfork: 'petersburg'
})
```