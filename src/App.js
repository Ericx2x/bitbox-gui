// react imports
import React, { Component } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Link,
  Switch,
  Redirect,
  NavLink
} from 'react-router-dom';
import Bitcoin from 'bitcoinjs-lib';

// custom models
import Block from './models/Block';
import Transaction from './models/Transaction';
import Output from './models/Output';
import Input from './models/Input';
import underscore from 'underscore';

import Utxo from './models/Utxo';

import WalletContainer from './containers/WalletContainer'
import BlocksContainer from './containers/BlocksContainer';
import BlockContainer from './containers/BlockContainer';
import AccountDetailsContainer from './containers/AccountDetailsContainer';
import TransactionContainer from './containers/TransactionContainer';
import SignAndVerifyContainer from './containers/SignAndVerifyContainer'
import ImportAndExportContainer from './containers/ImportAndExportContainer'
import ConvertContainer from './containers/ConvertContainer';
import StatusBarContainer from './containers/StatusBarContainer';
import ExplorerContainer from './containers/ExplorerContainer'

// custom components
import BlockDetails from './components/BlockDetails';
// import Account from './components/Account';
import Configuration from './components/Configuration';

// utilities
import BitcoinCash from './utilities/BitcoinCash';
import Miner from './utilities/Miner';

// css
import './styles/app.scss';

import { Provider } from 'react-redux'
import { createStore } from 'redux'
import bitboxReducer from './reducers/bitbox'

// redux actions
import {
  createConfig,
  toggleWalletConfig,
  updateWalletConfig,
  updateStore
} from './actions/ConfigurationActions';

import {
  createWallet,
  addRootSeed,
  addMasterPrivateKey,
  createAccount,
  updateAccount
} from './actions/WalletActions';

import {
  createImportAndExport,
  toggleVisibility,
  toggleExportCopied
} from './actions/ImportAndExportActions';

import {
  createConvert
} from './actions/ConvertActions';

import {
  createBlockchain,
  addBlock
} from './actions/BlockchainActions';

import {
  createSignAndVerify
} from './actions/SignAndVerifyActions';

import {
  createExplorer
} from './actions/ExplorerActions';

import {
  createAccountSend
} from './actions/AccountSendActions';

let reduxStore = createStore(bitboxReducer)

// const unsubscribe = reduxStore.subscribe(() =>{
//   console.log(JSON.stringify(reduxStore.getState(), null, 2))
//   console.log('*********************************************');
// })

// stop listening to state updates
// unsubscribe()

class App extends Component {

  constructor(props) {
    super(props);

    // Set up default redux store
    reduxStore.dispatch(createConfig());
    reduxStore.dispatch(createImportAndExport());
    reduxStore.dispatch(createConvert());
    reduxStore.dispatch(createBlockchain());
    reduxStore.dispatch(createSignAndVerify());
    reduxStore.dispatch(createExplorer());
  }

  componentDidMount() {
    this.createHDWallet();
  }


  createHDWallet() {
    let walletConfig = reduxStore.getState().configuration.wallet;
    let [rootSeed, masterPrivateKey, mnemonic, HDPath, accounts] = bitbox.BitcoinCash.createHDWallet(walletConfig);
    reduxStore.dispatch(createWallet());
    reduxStore.dispatch(addRootSeed(rootSeed));
    reduxStore.dispatch(addMasterPrivateKey(masterPrivateKey.chainCode));
    reduxStore.dispatch(updateWalletConfig('mnemonic', mnemonic));
    reduxStore.dispatch(updateWalletConfig('HDPath', HDPath));
    reduxStore.dispatch(createAccountSend());

    accounts.forEach((account, index) => {

      let address = bitbox.BitcoinCash.fromXPub(account.xpub, 0);
      let formattedAccount = {
        title: account.title,
        index: account.index,
        privateKeyWIF: account.privateKeyWIF,
        xpriv: account.xpriv,
        xpub: account.xpub,
        legacy: bitbox.BitcoinCash.Address.toLegacyAddress(address),
        cashAddr: address,
        freshAddresses: [address]
      };
      reduxStore.dispatch(createAccount(formattedAccount));
    });

    let blockchain = reduxStore.getState().blockchain;
    let previousBlock = underscore.last(blockchain.chain) || {};
    let account1 = reduxStore.getState().wallet.accounts[0];
    let account2 = reduxStore.getState().wallet.accounts[1];

    let alice = bitbox.BitcoinCash.fromWIF(account1.privateKeyWIF);
    let txb = bitbox.BitcoinCash.transactionBuilder(walletConfig.network);
    txb.addInput('61d520ccb74288c96bc1a2b20ea1c0d5a704776dd0164a396efec3ea7040349d', 0);
    let value = 1250000000;
    txb.addOutput(account2.legacy, value);
    txb.sign(0, alice);
    let hex = txb.build().toHex();

    bitbox.RawTransactions.decodeRawTransaction(hex)
    .then((result) => {
      let inputs = [];
      result.ins.forEach((vin, index) => {
        inputs.push(new Input({
          hex: vin.hex,
          inputPubKey: vin.inputPubKey,
          script: vin.script
        }));
      })

      let outputs = [];
      result.outs.forEach((vout, index) => {
        outputs.push(new Output({
          hex: vout.hex,
          outputPubKey: vout.outputPubKey,
          script: vout.script
        }));
      })

      let tx = new Transaction({
        value: value,
        rawHex: hex,
        timestamp: Date(),
        hash: bitbox.Crypto.createSHA256Hash(hex),
        inputs: inputs,
        outputs: outputs
      });

      let blockData = {
        index: 0,
        transactions: [tx],
        timestamp: Date()
      };

      let block = new Block(blockData)
      block.previousBlockHeader = previousBlock.header || "#BCHForEveryone";
      block.header = bitbox.Crypto.createSHA256Hash(`${block.index}${block.previousBlockHeader}${JSON.stringify(block.transactions)}${block.timestamp}`);
      blockchain.chain.push(block);
      let newChain = blockchain;
      reduxStore.dispatch(addBlock(newChain));
      reduxStore.dispatch(updateStore());

      account1.previousAddresses.push(account1.cashAddr)
      let newCashAddr = bitbox.BitcoinCash.fromXPub(account1.xpub, account1.previousAddresses.length);
      account1.cashAddr = newCashAddr;
      account1.legacy = bitbox.BitcoinCash.Address.toLegacyAddress(newCashAddr);
      account1.freshAddresses.push(account1.cashAddr)
      reduxStore.dispatch(updateAccount(account1));
    }, (err) => { console.log(err);
    });
  }

  handlePathMatch(path) {
    if(path === '/' || path === '/blocks' || path === '/transactions' || path === '/configuration/wallet') {
      return true;
    } else {
      return false;
    }
  }

  showImport() {
    reduxStore.dispatch(toggleVisibility('import'));
  }

  showExport() {
    reduxStore.dispatch(toggleVisibility('export'));
  }

  render() {

    const pathMatch = (match, location) => {
      if (!match) {
        return false
      }
      return this.handlePathMatch(match.path);
    }

    const AddressPage = (props) => {
      return (
        <Account
          match={props.match}
        />
      );
    };

    const TransactionsPage = (props) => {
      return (
        <TransactionsDisplay
          match={props.match}
        />
      );
    };

    const ConfigurationPage = (props) => {
      return (
        <Configuration
          match={props.match}
        />
      );
    };

    let chainlength = reduxStore.getState().blockchain.chain.length;



    return (
      <Provider store={reduxStore}>
        <Router>
          <div className="header main-header">
            <div className="pure-menu pure-menu-horizontal">
              <Link className="pure-menu-heading" to="/">BitBox</Link>
              <ul className="pure-menu-list">

                <li className="pure-menu-item">
                  <NavLink
                    isActive={pathMatch}
                    activeClassName="pure-menu-selected"
                    className="pure-menu-link"
                    to="/">
                    <i className="fas fa-user"></i> Wallet
                  </NavLink>
                </li>
                <li className="pure-menu-item">
                  <NavLink
                    isActive={pathMatch}
                    activeClassName="pure-menu-selected"
                    className="pure-menu-link"
                    to="/blocks">
                    <i className="fas fa-cubes"></i> Blocks
                  </NavLink>
                </li>
                <li className="pure-menu-item">
                  <NavLink
                    isActive={pathMatch}
                    activeClassName="pure-menu-selected"
                    className="pure-menu-link"
                    to="/convert">
                    <i className="fas fa-qrcode" /> Convert
                  </NavLink>
                </li>
                <li className="pure-menu-item">
                  <NavLink
                    isActive={pathMatch}
                    activeClassName="pure-menu-selected"
                    className="pure-menu-link"
                    to="/signandverify">
                    <i className="far fa-check-circle"></i> Sign &amp; Verify
                  </NavLink>
                </li>
              </ul>
              <ul className="pure-menu-list right">
                <li className="pure-menu-item Explorer">
                  <ExplorerContainer />
                </li>
                <li className="pure-menu-item">
                  <button className="importAndExportBtn" onClick={this.showExport.bind(this)}>
                    <i className="fas fa-upload" />
                  </button>
                </li>
                <li className="pure-menu-item">
                  <button className="importAndExportBtn" onClick={this.showImport.bind(this)}>
                    <i className="fas fa-download" />
                  </button>
                </li>
                <li className="pure-menu-item">
                  <NavLink
                    isActive={pathMatch}
                    activeClassName="pure-menu-selected"
                    className="pure-menu-link"
                    to="/configuration/wallet">
                    <i className="fas fa-cog" />
                  </NavLink>
                </li>
              </ul>
            </div>
            <StatusBarContainer />
            <ImportAndExportContainer />
            <Switch>
              <Route exact path="/blocks" component={BlocksContainer}/>
              <Route path="/blocks/:block_id/transactions/:transaction_id" component={TransactionContainer}/>
              <Route path="/blocks/:block_id" component={BlockContainer}/>
              <Route path="/accounts/:account_id" component={AccountDetailsContainer}/>
              <Route path="/convert" component={ConvertContainer}/>
              <Route path="/signandverify" component={SignAndVerifyContainer}/>
              <Route path="/configuration" component={ConfigurationPage}/>
              <Route exact path="/" component={WalletContainer}/>
              <Redirect from='*' to='/' />
            </Switch>
          </div>
        </Router>
      </Provider>
    );
  }
}

export default App;
