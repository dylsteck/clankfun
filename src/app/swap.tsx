"use client"

import { usePrivy, useWallets } from '@privy-io/react-auth';
import { track } from '@vercel/analytics/react';
import { ethers } from "ethers";
import { debounce } from 'lodash';
import { Copy } from 'lucide-react';
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";
import {
  concat,
  erc20Abi,
  numberToHex,
  size,
} from "viem";
import { useAccount, useBalance, useReadContract, useSendTransaction, useSignTypedData, useSimulateContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useToast } from "~/hooks/use-toast";
import { categorizeAmt } from '~/lib/analytics';
import { FButton } from "./components/FButton";
import { FConnectButtonLarge } from './components/FConnectButton';
import { FFromInput, FToInput } from "./components/FSwapper";
import { serverEthUSDPrice, serverFetchSwapPrice, serverFetchSwapQuote } from "./server";
import { type UIClanker } from '~/lib/types';

const MAX_ALLOWANCE =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

function formatAmount(amount: number) {
  if (amount > 100) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 5,
  }).format(amount);
}

function formatUSD(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function SwapInterface({ 
  clanker, 
  apeAmount, 
  onSwapComplete,
  onAped,
  refAddress
}: { 
  clanker: UIClanker, 
  apeAmount: number | null 
  onSwapComplete: () => void
  onAped: () => void
  refAddress: string | null
}) {

  const { toast } = useToast()
  const [amountText, setAmountText] = useState<string>("0.00");
  const [amount, setAmount] = useState<number>(0);
  const [isBuying, setIsBuying] = useState(true);
  const [buyAmount, setBuyAmount] = useState<number>(0);
  const [priceRes, setPriceRes] = useState<any>(null);
  const [ethPrice, setEthPrice] = useState<number>(3600);

  useEffect(() => {
    async function fetchPrice() {
      setEthPrice(await serverEthUSDPrice())
    }
    void fetchPrice()
  }, [])

  const swapUSDAmount =  isBuying ? amount * ethPrice : buyAmount * ethPrice;
  const sellTokenName = isBuying ? "ETH" : clanker.symbol;
  const buyTokenName = isBuying ? clanker.symbol : "ETH";

  const sellTokenAddress = isBuying ? ETH_ADDRESS : clanker.contract_address as `0x${string}`;

  const { authenticated } = usePrivy()
  const { address } = useAccount()
  const { data: ethBalance, isError: ethBalanceError } = useBalance({
    address,
  });
  const { data: tokenBalance, isError: tokenBalanceError } = useBalance({
    address,
    token: clanker.contract_address as `0x${string}`,
  });

  function balances() {
    const eth = ethBalance ? parseFloat(ethers.formatEther(ethBalance.value)) : 0
    const token = tokenBalance ? parseFloat(ethers.formatEther(tokenBalance.value)) : 0
    return {
      eth,
      token,
      buying: isBuying ? eth : token,
    }
  }

  const handlePercentageChange = (newPercentage: number) => {
    if (newPercentage == 100) {
      if (isBuying) {
        newPercentage = 98;
      } else [
        newPercentage = 99.9999
      ]
    }
    const { eth, token } = balances();
    const newAmount = isBuying ? eth * (newPercentage / 100) : (token * (newPercentage / 100));
    setAmountText(String(newAmount));
  };

  const updateSwapAmount = async () => {
    console.log("Fetching quote")
    if (!address || !clanker) return;
    if (amount <= 0) {
      setBuyAmount(0);
      return;
    }
    console.log("Fethcing server swap price")
    const res = await serverFetchSwapPrice(
      address, 
      clanker.contract_address, 
      amount, 
      !isBuying
    );
    if (!res.buyAmount) return;

    console.log("Not canceeled")
    const buyAmount = parseFloat(ethers.formatEther(res.buyAmount));
    setBuyAmount(buyAmount);
    setPriceRes(res);
  }

  useEffect(() => {
    const cancelToken = { cancelled: false };
    updateSwapAmount();
    return () => { cancelToken.cancelled = true; }
  }, [amount, isBuying]);

  const {
    data: hash,
    isPending: transactionPending,
    error: transactionError,
    sendTransaction,
  } = useSendTransaction();

  const {
    wallets
  } = useWallets()

  useEffect(() => {
    if (transactionError) {
      console.log("Transaction error", transactionError)
      toast({
        title: "Failed to clank 👎",
        description: "Your transaction has failed. Please try again.",
      })
    }
  }, [transactionError])

  const { data: receipt, isLoading: waitingForReceipt, error: waitingError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (waitingForReceipt) {
      toast({
        title: "Swapping...",
        description: "Your transaction is being processed.",
      });
    }
    if (receipt) {
      if (isBuying) {
        if (refAddress) {
          track("Copytrade", {
            token: clanker.symbol,
            clanker: clanker.contract_address,
            referrer: refAddress
          })
        }
        track("Buy", {
          amountUSD: categorizeAmt(swapUSDAmount),
          token: clanker.symbol,
          contract: clanker.contract_address,
          txHash: receipt.transactionHash,
        })
      } else {
        track("Sell", {
          amountUSD: categorizeAmt(swapUSDAmount),
          token: clanker.symbol,
          contract: clanker.contract_address,
          txHash: receipt.transactionHash,
        })
      }
      toast({
        title: "Clanked! 💰 👌",
        description: "Your transaction was successful.",
      })
      onSwapComplete()
    }
    if (waitingError) {
      console.log("Waiting error", hash, waitingError)
      toast({
        title: "Failed to clank 👎",
        description: "Your transaction has failed. Please try again.",
      })
    }
  }, [receipt, waitingForReceipt, waitingError]);

  const [userShouldApprove, setUserShouldApprove] = useState(false);

  const { signTypedDataAsync, isPending: signPending } = useSignTypedData()

  async function startSwap(amount: number, isBuying: boolean) {
    if (!address || !clanker || amount <= 0 ) return;
    console.log("Fetching quote")
    if (!wallets?.[0]) {
      return
    }
    await wallets[0].switchChain(8453)

    const quote = await serverFetchSwapQuote(
      address, 
      clanker.contract_address, 
      amount, 
      !isBuying,
      refAddress ? refAddress : undefined
    )

    if (!quote.transaction) {
      console.log("No transaction, returning")
      return
    }

    if (quote.permit2) {
      console.log("Getting signature")
      const signature = await signTypedDataAsync(quote.permit2.eip712)
      const signatureLengthInHex = numberToHex(size(signature), {
        signed: false,
        size: 32,
      });

      const transactionData = quote.transaction.data as Hex;
      const sigLengthHex = signatureLengthInHex as Hex;
      const sig = signature as Hex;

      quote.transaction.data = concat([
        transactionData,
        sigLengthHex,
        sig,
      ]);
    }

    setUserShouldApprove(true);
    console.log("Sending transaction")
    if (!sendTransaction) {
      console.log("No sendTransaction")
      return
    }
    sendTransaction &&
    sendTransaction({
      account: address,
      gas: !!quote?.transaction.gas
        ? BigInt(quote?.transaction.gas)
        : undefined,
      to: quote?.transaction.to,
      data: quote.transaction.data, // submit
      value: quote?.transaction.value
        ? BigInt(quote.transaction.value)
        : undefined, // value is used for native tokens
      chainId: 8453,
    });
    setUserShouldApprove(false);
  }

  async function initiateSwap() {
    startSwap(amount, isBuying);
  }

  const handleTabSwitch = (buy: boolean) => {
    setIsBuying(buy);
    setAmountText("0.00");
    setBuyAmount(0);
  };

  const debouncedUpdateAmount = useCallback(
    debounce((text: string) => {
      const parsedAmount = parseFloat(text);
      setAmount(isNaN(parsedAmount) ? 0 : parsedAmount);
    }, 500),
    []
  );

  useEffect(() => {
    debouncedUpdateAmount(amountText);
  }, [amountText, debouncedUpdateAmount]);

  function copyCA() {
    if (clanker.contract_address) {
      navigator.clipboard.writeText(clanker.contract_address);
      toast({
        title: "Copied Contract Address",
        description: `The contract address has been copied to your clipboard (${clanker.contract_address.slice(0, 6)}...)`,
      })
      track("Copy CA", {
        contract: clanker.contract_address,
      })
    }
  }

  const actionPending = transactionPending || signPending;
  const hasFunds = balances().buying >= amount;
  let feeText = "clank.fun fee:"
  if (refAddress && isBuying) {
    feeText = `referral fee (${refAddress.slice(0,5)})`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <FButton onClick={() => handleTabSwitch(true)} selected={isBuying}>
          Buy
        </FButton>
        <FButton onClick={() => handleTabSwitch(false)} selected={!isBuying}>
          Sell
        </FButton>
        <div className='flex-grow'/>
        <FButton onClick={() => copyCA()} faded>
          <Copy size={16} />
        </FButton>
      </div>
      <div className="flex flex-col gap-1">
        <FFromInput
          value={amountText}
          onChange={setAmountText}
          onPercentageClick={handlePercentageChange}
          tokenName={sellTokenName}
          tokenImage={isBuying ? "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png" : clanker.img_url ?? ""}
        />
        <FToInput
          value={buyAmount}
          tokenName={buyTokenName}
          tokenImage={isBuying ? (clanker.img_url ?? "") : "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png"}
        />
        {!hasFunds ?
          <div className="h-[15px] justify-between items-start inline-flex mt-2">
            <div className="text-white/50 text-[15px] font-normal   leading-[15px]">You do not have sufficient funds</div>
          </div>
        : (
          <>
            {swapUSDAmount > 0.01 && <div className="flex flex-col w-full">
              <div className="h-[15px] justify-between items-start inline-flex mt-2">
                <div className="text-white/50 text-[15px] font-normal   leading-[15px]">Balance:</div>
                <div className="text-white text-[15px] font-normal   leading-[15px]">{formatAmount(balances().buying)} {sellTokenName}</div>
              </div>
              <div className="h-[15px] justify-between items-start inline-flex mt-2">
                <div className="text-white/50 text-[15px] font-normal   leading-[15px]">You&apos;ll swap:</div>
                <div className="text-white text-[15px] font-normal   leading-[15px]">{formatAmount(amount)} {sellTokenName} ({formatUSD(swapUSDAmount)})</div>
              </div>
              <div className="h-[15px] justify-between items-start inline-flex mt-2">
                <div className="text-white/50 text-[15px] font-normal   leading-[15px]">You&apos;ll receive:</div>
                <div className="text-purple-500 text-[15px] font-normal   leading-[15px]">~{formatAmount(buyAmount)} {buyTokenName}</div>
              </div>
              <div className="h-[15px] justify-between items-start inline-flex mt-2">
                <div className="text-white/50 text-[15px] font-normal   leading-[15px]">{feeText}</div>
                <div className="text-white text-[15px] font-normal   leading-[15px]">0.5% ({formatUSD(swapUSDAmount * 0.005)})</div>
              </div>
            </div>}
          </>
        )}
      <div className="mt-3">
      {authenticated && address ? <ApproveOrReviewButton 
        onClick={initiateSwap} 
        taker={address as Address} 
        sellTokenAddress={sellTokenAddress} 
        disabled={actionPending} 
        price={priceRes} 
        userShouldApprove={userShouldApprove}
      /> : 
        <FConnectButtonLarge />
      }
    </div>
    </div>
    </div>
  );
}

function ApproveOrReviewButton({
  taker,
  onClick,
  sellTokenAddress,
  disabled,
  price,
  userShouldApprove
}: {
  taker: Address;
  onClick: () => void;
  sellTokenAddress: Address;
  disabled?: boolean;
  price: any;
  userShouldApprove: boolean;
}) {
  // If price.issues.allowance is null, show the Review Trade button
  if (price?.issues.allowance === null) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          // fetch data, when finished, show quote view
          onClick();
        }}
        className="w-full bg-[#7962D9] hover:bg-[#8D72FD] text-white p-2 rounded disabled:opacity-25"
      >
        {disabled ? "Swapping..." : userShouldApprove ? "Check Wallet" : "Swap"}
      </button>
    );
  }

  // Determine the spender from price.issues.allowance
  const spender = price?.issues.allowance.spender;

  // 1. Read from erc20, check approval for the determined spender to spend sellToken
  const { data: allowance, refetch } = useReadContract({
    address: sellTokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [taker, spender],
  });
  console.log("checked spender approval");

  // 2. (only if no allowance): write to erc20, approve token allowance for the determined spender
  const { data } = useSimulateContract({
    address: sellTokenAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, MAX_ALLOWANCE],
  });

  // Define useWriteContract for the 'approve' operation
  const {
    data: writeContractResult,
    writeContractAsync: writeContract,
    error,
  } = useWriteContract();

  // useWaitForTransactionReceipt to wait for the approval transaction to complete
  const { data: approvalReceiptData, isLoading: isApproving } =
    useWaitForTransactionReceipt({
      hash: writeContractResult,
    });

  // Call `refetch` when the transaction succeeds
  useEffect(() => {
    if (data || approvalReceiptData) {
      refetch();
    }
  }, [data, approvalReceiptData, refetch]);

  if (error) {
    return <div>Something went wrong: {error.message}</div>;
  }

  if (allowance === 0n) {
    return (
      <>
        <button
          type="button"
          className="bg-[#7962D9] hover:bg-[#8D72FD] text-white font-bold py-2 px-4 rounded w-full"
          onClick={async () => {
            await writeContract({
              abi: erc20Abi,
              address: sellTokenAddress,
              functionName: "approve",
              args: [spender, MAX_ALLOWANCE],
            });
            console.log("approving spender to spend sell token");

            refetch();
          }}
        >
          {isApproving ? "Approving…" : "Approve"}
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        // fetch data, when finished, show quote view
        onClick();
      }}
      className="w-full bg-[#7962D9] hover:bg-[#8D72FD] text-white p-2 rounded disabled:opacity-25"
    >
      {disabled ? "Swapping..." : "Swap"}
    </button>
  );
}
