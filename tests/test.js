const {
  Connection,
  sendAndConfirmTransaction,
  Keypair,
  Transaction,
  SystemProgram,
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY
} = require("@solana/web3.js");
const { readFile } = require("mz/fs");
const { TOKEN_PROGRAM_ID, createMint, mintTo, createAccount, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const serum = require("@project-serum/serum");
const {
  DexInstructions,
  TokenInstructions,
  OpenOrdersPda,
  MARKET_STATE_LAYOUT_V3,
  encodeInstruction,
  OpenOrders
} = serum;
var assert = require('chai').assert;
const BN = require("bn.js");

describe("Serum Client", () => {

  let feePayer;
  let programId;
  let marketKP;
  let requestQueueKP;
  let eventQueueKP;
  let bids;
  let asks;
  let maker;
  let taker;
  let open_orders_account_maker;
  let open_orders_account_taker;
  let connection;
  let Token1;
  let Token2;
  let maker_price_acc;
  let taker_price_acc;
  let taker_coin_acc;
  let market;
  let market_coin_account;
  let market_price_account;
  let vaultOwner;
  let nonce;
  const MAKER_PRICE_ACC_AMOUNT = 120;
  const TAKER_COIN_ACC_AMOUNT = 140;
  const ORDER_1_LIMIT_PRICE = 55;
  const ORDER_1_AMOUNT = 2;
  const ORDER_2_LIMIT_PRICE = 55;
  const ORDER_2_AMOUNT = 20;
  const BASE_LOT_SIZE = 1;
  const QUOTE_LOT_SIZE = 1;

  before(async () => {

    const args = process.argv.slice(2);
  
    if (args.length > 3) {
      string = await readFile(args[4], {
        encoding: "utf8",
      });
      console.log("Loaded Keypair from ", args[4]);
      const sk = Uint8Array.from(JSON.parse(string));
      feePayer = Keypair.fromSecretKey(sk);
    } else {
      feePayer = new Keypair();
    }
  
    programId = new PublicKey(args[3]);
    marketKP = new Keypair();
    requestQueueKP = new Keypair();
    eventQueueKP = new Keypair();
    bids = new Keypair();
    asks = new Keypair();
    maker = feePayer;
    taker = new Keypair();
    open_orders_account_maker = new Keypair();
    open_orders_account_taker = new Keypair();
  
    connection = new Connection("http://127.0.0.1:8899", 'processed');
    const airdrop_sig = await connection.requestAirdrop(feePayer.publicKey, 2e9);
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdrop_sig,
    });
    const airdrop_sig2 = await connection.requestAirdrop(taker.publicKey, 2e9);
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdrop_sig2,
    });
  
    Token1 = await createMint(
      connection,
      feePayer,
      feePayer.publicKey,
      null,
      0,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
    Token2 = await createMint(
      connection,
      feePayer,
      feePayer.publicKey,
      null,
      0,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );
  
    maker_price_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      Token1,
      maker.publicKey
    )
    maker_coin_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      Token2,
      maker.publicKey
    )
    taker_coin_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      taker,
      Token2,
      taker.publicKey
    )
    taker_price_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      taker,
      Token1,
      taker.publicKey
    )
    
    await mintTo(
      connection,
      feePayer,
      Token1,
      maker_price_acc.address,
      feePayer,
      MAKER_PRICE_ACC_AMOUNT
    )

    await mintTo(
      connection,
      taker,
      Token2,
      taker_coin_acc.address,
      feePayer,
      TAKER_COIN_ACC_AMOUNT
    )
  })


  // This test creates accounts for the accounts that need to be passed into InitializeMarket, then intializes the market
  it("Initializes Market", async () => {

    [vaultOwner, nonce] = await getVaultOwnerAndNonce(
      marketKP.publicKey,
      programId
    );
    market_coin_account = await getOrCreateAssociatedTokenAccount(
      connection,
      feePayer,
      Token2,
      vaultOwner,
      true
    );
    market_price_account = await getOrCreateAssociatedTokenAccount(
      connection,
      feePayer,
      Token1,
      vaultOwner,
      true
    );

    const tx = new Transaction();

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: marketKP.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(
          388
        ),
        space: 388,
        programId: programId,
      }),
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: requestQueueKP.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(5120 + 12),
        space: 5120 + 12,
        programId: programId,
      }),
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: eventQueueKP.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(262144 + 12),
        space: 262144 + 12,
        programId: programId,
      }),
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: bids.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
        space: 65536 + 12,
        programId: programId,
      }),
      SystemProgram.createAccount({
        fromPubkey: feePayer.publicKey,
        newAccountPubkey: asks.publicKey,
        lamports: await connection.getMinimumBalanceForRentExemption(65536 + 12),
        space: 65536 + 12,
        programId: programId,
      }),
      DexInstructions.initializeMarket({
        market: marketKP.publicKey,
        requestQueue: requestQueueKP.publicKey,
        eventQueue: eventQueueKP.publicKey,
        bids: bids.publicKey,
        asks: asks.publicKey,
        baseVault: market_coin_account.address,
        quoteVault: market_price_account.address,
        baseMint: Token2,
        quoteMint: Token1,
        baseLotSize: new BN(BASE_LOT_SIZE),
        quoteLotSize: new BN(QUOTE_LOT_SIZE),
        feeRateBps: 0,
        vaultSignerNonce: nonce,
        quoteDustThreshold: new BN(100),
        programId: programId,
      })
    );

    const txid = await sendAndConfirmTransaction(
      connection,
      tx,
      [feePayer, marketKP, requestQueueKP, eventQueueKP, bids, asks],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    console.log('Transaction 1 complete', txid);

    market = await serum.Market.load(connection, marketKP.publicKey, {}, programId);

    assert.equal(market._decoded.accountFlags.initialized, true)
    assert.equal(market._decoded.accountFlags.market, true)
    assert.equal(market._decoded.ownAddress.toBase58(), marketKP.publicKey.toBase58())

  });

  // This test creates an open order account for the maker,
  // Then, the maker places a BUY order.
  it("Creates Limit Order", async () => {

    const tx2 = new Transaction();

    tx2.add(
      await OpenOrders.makeCreateAccountTransaction(
        connection,
        marketKP.publicKey,
        maker.publicKey,
        open_orders_account_maker.publicKey,
        programId,
      ),
    ).add(
      market.makePlaceOrderInstruction(connection, {
        owner: feePayer.publicKey,
        payer: maker_price_acc.address,
        side: "buy",
        price: ORDER_1_LIMIT_PRICE,
        size: ORDER_1_AMOUNT,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_maker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    );

    let txid2 = await sendAndConfirmTransaction(
      connection,
      tx2,
      [feePayer, open_orders_account_maker],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );
  
    console.log('Transaction 2 complete', txid2);

    let base_vault_acc = await connection.getTokenAccountBalance(new PublicKey(market._decoded.baseVault.toBase58()))
    let quote_vault_acc = await connection.getTokenAccountBalance(new PublicKey(market._decoded.quoteVault.toBase58()))
    let maker_price_acc_info = (await connection.getTokenAccountBalance(maker_price_acc.address)).value.amount;

    // This assert checks that the base_vault account is still empty
    assert.equal(parseInt(base_vault_acc.value.amount), 0);
    // This checks that the quote_vault is now equal to the PRICE*AMOUNT of the Maker's order
    assert.equal(parseInt(quote_vault_acc.value.amount), ORDER_1_LIMIT_PRICE*ORDER_1_AMOUNT);
    // This checks to make sure that the maker's Price token account has decremented the correct amount
    assert.equal(maker_price_acc_info, MAKER_PRICE_ACC_AMOUNT - (ORDER_1_LIMIT_PRICE*ORDER_1_AMOUNT));

  });

  // This test creates an open order account for the taker, and then places a limit SELL order
  it("Creates Limit Order that Fills Maker", async () => {

    const tx3 = new Transaction();

    tx3.add(
      await OpenOrders.makeCreateAccountTransaction(
        connection,
        marketKP.publicKey,
        taker.publicKey,
        open_orders_account_taker.publicKey,
        programId,
      ),
    ).add(
      market.makePlaceOrderInstruction(connection, {
        owner: taker.publicKey,
        payer: taker_coin_acc.address,
        side: "sell",
        price: ORDER_2_LIMIT_PRICE,
        size: ORDER_2_AMOUNT,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_taker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    );

    let txid3 = await sendAndConfirmTransaction(
      connection,
      tx3,
      [taker, open_orders_account_taker],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    console.log("transaction 3 done", txid3);

    let base_vault_acc = await connection.getTokenAccountBalance(new PublicKey(market._decoded.baseVault.toBase58()))
    let quote_vault_acc = await connection.getTokenAccountBalance(new PublicKey(market._decoded.quoteVault.toBase58()))

    // This checks that the base_vault is equal to how much coin the order wanted to sell
    assert.equal(parseInt(base_vault_acc.value.amount), ORDER_2_AMOUNT);
    // This checks that the quote_vault hasn't changed since order 1
    assert.equal(parseInt(quote_vault_acc.value.amount), ORDER_1_LIMIT_PRICE*ORDER_1_AMOUNT);

    const fills = [];
    for (let fill of await market.loadFills(connection)) {
      fills.push(fill);
      console.log(fill.orderId, fill.price, fill.size, fill.side);
    };

    // This checks that the fills array has the correct amount of elements
    // 2, one for the Maker and one for the Taker
    assert.equal(fills.length, 2);

    // let taker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_coin_acc.address.toBase58()))
    // let taker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_price_acc.address.toBase58()))

    // let taker_coin_amt_before = parseInt(taker_coin_acc_info.value.amount)
    // let taker_price_amt_before = parseInt(taker_price_acc_info.value.amount)

    // let maker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_coin_acc.toBase58()))
    // let maker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_price_acc.toBase58()))

    // let maker_coin_amt_before = parseInt(maker_coin_acc_info.value.amount)
    // let maker_price_amt_before = parseInt(maker_price_acc_info.value.amount)

    // Settle funds for taker (do not need consume_events, because taker orders have free tokens updated)
    for (let openOrders of await market.findOpenOrdersAccountsForOwner(
      connection,
      taker.publicKey,
    )) {

      if (openOrders.baseTokenFree > 0 || openOrders.quoteTokenFree > 0) {
  
        await market.settleFunds(
          connection,
          taker,
          openOrders,
          taker_coin_acc.address,
          taker_price_acc.address,
        );
      }
    };

    const tx4 = new Transaction();

    tx4.add(
      market.makeConsumeEventsInstruction([open_orders_account_maker.publicKey], 100)
    )

    let txid4 = await sendAndConfirmTransaction(
      connection,
      tx4,
      [feePayer],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    console.log('tx4 done', txid4)

    for (let openOrders of await market.findOpenOrdersAccountsForOwner(
      connection,
      maker.publicKey,
    )) {

      if (openOrders.baseTokenFree > 0 || openOrders.quoteTokenFree > 0) {

        await market.settleFunds(
          connection,
          maker,
          openOrders,
          maker_coin_acc.address,
          maker_price_acc.address,
        );
      }
    };

    taker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_coin_acc.address.toBase58()))
    taker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_price_acc.address.toBase58()))

    // This assert makes sure that taker_coin_acc is equal to the original amount they had minus the ORDER_2_AMOUNT
    assert.equal(taker_coin_acc_info.value.amount, TAKER_COIN_ACC_AMOUNT - ORDER_2_AMOUNT);
    // This assert ensures that the taker_price_acc is AT MOST (because of fees) the ORDER_1 amount times the limit price
    assert.isAtMost(parseInt(taker_price_acc_info.value.amount), ORDER_1_AMOUNT*ORDER_2_LIMIT_PRICE);
    // This assert ensures that the taker_price_acc is ABOVE 0
    assert.isAbove(parseInt(taker_price_acc_info.value.amount), 0);
    
    maker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_coin_acc.address.toBase58()))
    maker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_price_acc.address.toBase58()))

    // These asserts ensure that the maker has received their coin amount and that their price amount is deducted 
    assert.equal(maker_price_acc_info.value.amount, MAKER_PRICE_ACC_AMOUNT - ORDER_1_AMOUNT*ORDER_1_LIMIT_PRICE);
    assert.equal(maker_coin_acc_info.value.amount, ORDER_1_AMOUNT);



  });

  let processSendTaker
  let processSendTaker_coin_acc
  let processSendTaker_price_acc
  const SEND_TAKER_PRICE_ACC_AMOUNT = 230
  const SEND_TAKE_PRICE_AMOUNT = 221
  const SEND_TAKE_COIN_AMOUNT = 4
  const SEND_TAKE_DATA_1 = Buffer.concat([
    Buffer.from(new Uint8Array([0])),
    Buffer.from(new Uint8Array((new BN(13)).toArray("le", 4))),
    Buffer.from(new Uint8Array((new BN(0)).toArray("le", 4))), //side
    Buffer.from(new Uint8Array((new BN(55)).toArray("le", 8))), //limit_price
    Buffer.from(new Uint8Array((new BN(SEND_TAKE_COIN_AMOUNT)).toArray("le", 8))), //max_coin
    Buffer.from(new Uint8Array((new BN(SEND_TAKE_PRICE_AMOUNT)).toArray("le", 8))), // max_price
    Buffer.from(new Uint8Array((new BN(1)).toArray("le", 8))), //min_coin
    Buffer.from(new Uint8Array((new BN(1)).toArray("le", 8))), //min_price
    Buffer.from(new Uint8Array((new BN(60000)).toArray("le", 2))), // limit
  ])

  // This test sends a take order to the market that buys coin, which should be desposited into their wallet in one step
  // Then, it lets the original seller of the coin settle their funds
  it("Sends Take - Bid", async () => { 

    const tx5 = new Transaction();

    processSendTaker = new Keypair();
    
    processSendTaker_coin_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      feePayer,
      Token2,
      processSendTaker.publicKey
    )

    processSendTaker_price_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      feePayer,
      Token1,
      processSendTaker.publicKey
    ) 

    await mintTo(
      connection,
      feePayer,
      Token1,
      processSendTaker_price_acc.address,
      feePayer,
      SEND_TAKER_PRICE_ACC_AMOUNT
    )

    let processSendTaker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_coin_acc.address.toBase58()))
    let processSendTaker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_price_acc.address.toBase58()))

    assert.equal(processSendTaker_coin_acc_info.value.amount, 0)
    assert.equal(processSendTaker_price_acc_info.value.amount, SEND_TAKER_PRICE_ACC_AMOUNT)


    const takeIx = new TransactionInstruction({
      keys: [
        {
          pubkey: marketKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: requestQueueKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: eventQueueKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: bids.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: asks.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker_coin_acc.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker_price_acc.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker.publicKey,
          isSigner: true,
          isWritable: false,
        },
        {
          pubkey: market_coin_account.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: market_price_account.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: vaultOwner,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId,
      data: SEND_TAKE_DATA_1,
    })

    tx5.add(takeIx)

    let txid5 = await sendAndConfirmTransaction(
      connection,
      tx5,
      [feePayer, processSendTaker],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    processSendTaker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_coin_acc.address.toBase58()))
    processSendTaker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_price_acc.address.toBase58()))

    assert.isAbove(parseInt(processSendTaker_coin_acc_info.value.amount), 0)
    assert.equal(parseInt(processSendTaker_price_acc_info.value.amount), SEND_TAKER_PRICE_ACC_AMOUNT-SEND_TAKE_PRICE_AMOUNT)

    market = await serum.Market.load(connection, marketKP.publicKey, {}, programId);

    // These asserts ensure that the market's base deposits calculations are correct
    assert.equal(parseInt(market._decoded.baseDepositsTotal.toString()), ORDER_2_AMOUNT - ORDER_1_AMOUNT - SEND_TAKE_COIN_AMOUNT)
    assert.isAbove(parseInt(market._decoded.quoteDepositsTotal.toString()), 0)


    const tx6 = new Transaction();

    tx6.add(
      market.makeConsumeEventsInstruction([open_orders_account_taker.publicKey], 100)
    )

    let txid6 = await sendAndConfirmTransaction(
      connection,
      tx6,
      [feePayer],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    for (let openOrders of await market.findOpenOrdersAccountsForOwner(
      connection,
      taker.publicKey,
    )) {
      if (openOrders.baseTokenFree > 0 || openOrders.quoteTokenFree > 0) {
  
        await market.settleFunds(
          connection,
          taker,
          openOrders,
          taker_coin_acc.address,
          taker_price_acc.address,
        );
      }
    };

    taker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_coin_acc.address.toBase58()))
    taker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(taker_price_acc.address.toBase58()))

    // This assert ensures that the taker, upon settle funds, gets the correct amount of price currency, as it corresponds to the send_take order
    assert.isAbove(parseInt(taker_price_acc_info.value.amount), SEND_TAKE_PRICE_AMOUNT)
    
  });

  const LEFTOVER_MAKER_PRICE_ACC_AMOUNT = 10
  const MINT_TO_MAKER_PRICE_ACC = 250
  const ORDER_7_LIMIT_PRICE = 50
  const ORDER_7_AMOUNT = 3
  const ORDER_8_COIN_AMOUNT = 4
  const ORDER_8_PRICE_AMOUNT = 201
  const SEND_TAKE_DATA_2 = Buffer.concat([
    Buffer.from(new Uint8Array([0])),
    Buffer.from(new Uint8Array((new BN(13)).toArray("le", 4))), // instruction number
    Buffer.from(new Uint8Array((new BN(1)).toArray("le", 4))), //side
    Buffer.from(new Uint8Array((new BN(ORDER_7_LIMIT_PRICE)).toArray("le", 8))), //limit_price
    Buffer.from(new Uint8Array((new BN(ORDER_8_COIN_AMOUNT)).toArray("le", 8))), //max_coin
    Buffer.from(new Uint8Array((new BN(ORDER_8_PRICE_AMOUNT)).toArray("le", 8))), // max_price
    Buffer.from(new Uint8Array((new BN(1)).toArray("le", 8))), //min_coin
    Buffer.from(new Uint8Array((new BN(1)).toArray("le", 8))), //min_price
    Buffer.from(new Uint8Array((new BN(60000)).toArray("le", 2))), // limit
  ])

  // This test ensures that send take works for ASKs as well as bids
  it("Sends Take - Ask", async () => {

    await mintTo(
      connection,
      feePayer,
      Token1,
      maker_price_acc.address,
      feePayer,
      MINT_TO_MAKER_PRICE_ACC
    )

    maker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_price_acc.address.toBase58()))

    assert.equal(parseInt(maker_price_acc_info.value.amount), LEFTOVER_MAKER_PRICE_ACC_AMOUNT + MINT_TO_MAKER_PRICE_ACC)

    const tx7 = new Transaction();

    tx7.add(
      market.makePlaceOrderInstruction(connection, {
        owner: feePayer.publicKey,
        payer: maker_price_acc.address,
        side: "buy",
        price: ORDER_7_LIMIT_PRICE,
        size: ORDER_7_AMOUNT,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_maker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    );

    let txid7 = await sendAndConfirmTransaction(
      connection,
      tx7,
      [feePayer],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    maker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(maker_price_acc.address.toBase58()))

    assert.equal(parseInt(maker_price_acc_info.value.amount), LEFTOVER_MAKER_PRICE_ACC_AMOUNT + MINT_TO_MAKER_PRICE_ACC - (ORDER_7_LIMIT_PRICE*ORDER_7_AMOUNT))

    const tx8 = new Transaction();

    const takeIx = new TransactionInstruction({
      keys: [
        {
          pubkey: marketKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: requestQueueKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: eventQueueKP.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: bids.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: asks.publicKey,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker_coin_acc.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker_price_acc.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: processSendTaker.publicKey,
          isSigner: true,
          isWritable: false,
        },
        {
          pubkey: market_coin_account.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: market_price_account.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: vaultOwner,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId,
      data: SEND_TAKE_DATA_2,
    })

    tx8.add(takeIx)

    let processSendTaker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_coin_acc.address.toBase58()))
    let processSendTaker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_price_acc.address.toBase58()))

    let coin_amt_before = processSendTaker_coin_acc_info.value.amount
    let price_amt_before = processSendTaker_price_acc_info.value.amount

    console.log('processSendTaker_coin_acc.value.amount before', processSendTaker_coin_acc_info.value.amount)
    console.log('processSendTaker_price_acc.value.amount before', processSendTaker_price_acc_info.value.amount)

    market = await serum.Market.load(connection, marketKP.publicKey, {}, programId);

    console.log('market baseDepositsTotal', market._decoded.baseDepositsTotal.toString())
    console.log('market quoteDepositsTotal', market._decoded.quoteDepositsTotal.toString())

    let txid8 = await sendAndConfirmTransaction(
      connection,
      tx8,
      [feePayer, processSendTaker],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );

    processSendTaker_coin_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_coin_acc.address.toBase58()))
    processSendTaker_price_acc_info = await connection.getTokenAccountBalance(new PublicKey(processSendTaker_price_acc.address.toBase58()))

    let coin_amt_after = processSendTaker_coin_acc_info.value.amount
    let price_amt_after = processSendTaker_price_acc_info.value.amount

    // assert.equal(parseInt(coin_amt_after), parseInt(coin_amt_before) - ORDER_8_COIN_AMOUNT)
    // assert.isAbove(parseInt(price_amt_after), parseInt(price_amt_before))

    console.log('processSendTaker_coin_acc.value.amount', processSendTaker_coin_acc_info.value.amount)
    console.log('processSendTaker_price_acc.value.amount', processSendTaker_price_acc_info.value.amount)

    market = await serum.Market.load(connection, marketKP.publicKey, {}, programId);

    console.log('market baseDepositsTotal', market._decoded.baseDepositsTotal.toString())
    console.log('market quoteDepositsTotal', market._decoded.quoteDepositsTotal.toString())

    console.log('marketKP.pk', marketKP.publicKey.toBase58())
    console.log('marketKP', marketKP)
    console.log('vaultOwner', vaultOwner.toBase58())

    maker_price_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      Token1,
      maker.publicKey
    )
    maker_coin_acc = await getOrCreateAssociatedTokenAccount(
      connection,
      maker,
      Token2,
      maker.publicKey
    )
    console.log('token1 PRICE TOKEN PK', Token1.toBase58())
    console.log('token2 COIN TOKEN PK', Token2.toBase58())
    console.log('makerPriceAccamount', maker_price_acc.address.toBase58())
    console.log('makerPriceAccamount', maker_price_acc.amount)
    console.log('makerCoinAccamount', maker_coin_acc.address.toBase58())
    console.log('makerCoinAccamount', maker_coin_acc.amount)
    console.log('maker.publicKey', maker.publicKey.toBase58())
    console.log('maker', maker)


    await mintTo(
      connection,
      feePayer,
      Token1,
      maker_price_acc.address,
      feePayer,
      100000000
    )

    await mintTo(
      connection,
      taker,
      Token2,
      taker_coin_acc.address,
      feePayer,
      10000
    )

    const tx9 = new Transaction();

    tx9.add(
      market.makePlaceOrderInstruction(connection, {
        owner: feePayer.publicKey,
        payer: maker_price_acc.address,
        side: "buy",
        price: 52,
        size: 10,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_maker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    ).add(
      market.makePlaceOrderInstruction(connection, {
        owner: feePayer.publicKey,
        payer: maker_price_acc.address,
        side: "buy",
        price: 50,
        size: 8,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_maker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    ).add(
      market.makePlaceOrderInstruction(connection, {
        owner: feePayer.publicKey,
        payer: maker_price_acc.address,
        side: "buy",
        price: 53,
        size: 5,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_maker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    );

    let txid9 = await sendAndConfirmTransaction(
      connection,
      tx9,
      [feePayer],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );
  
    console.log('Transaction 9 complete', txid9);

    const tx10 = new Transaction();


    tx10.add(
      market.makePlaceOrderInstruction(connection, {
        owner: taker.publicKey,
        payer: taker_coin_acc.address,
        side: "sell",
        price: 57,
        size: 5,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_taker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    ).add(
      market.makePlaceOrderInstruction(connection, {
        owner: taker.publicKey,
        payer: taker_coin_acc.address,
        side: "sell",
        price: 58,
        size: 8,
        orderType: 'limit',
        clientId: undefined,
        openOrdersAddressKey: open_orders_account_taker.publicKey,
        openOrdersAccount: undefined,
        feeDiscountPubkey: undefined
      })
    );

    let txid10 = await sendAndConfirmTransaction(
      connection,
      tx10,
      [taker],
      {
        skipPreflight: true,
        preflightCommitment: "confirmed",
        confirmation: "confirmed",
      }
    );
  
    console.log('Transaction 10 complete', txid10);


  });

})


async function getVaultOwnerAndNonce(marketPublicKey, dexProgramId = DEX_PID) {
  console.log('marketPublicKey', marketPublicKey)
  console.log('dexProgramId', dexProgramId)
  const nonce = new BN(0);
  while (nonce.toNumber() < 255) {
    try {
      const vaultOwner = await PublicKey.createProgramAddress(
        [marketPublicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
        dexProgramId
      );
      return [vaultOwner, nonce];
    } catch (e) {
      nonce.iaddn(1);
    }
  }
  throw new Error("Unable to find nonce");
}