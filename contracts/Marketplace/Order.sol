// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../lib/NFTHelper.sol";
import "../lib/TransferHelper.sol";
import "../lib/OrderHelper.sol";
import "../Validatable.sol";
import "../lib/ErrorHelper.sol";

/**
 *  @title  Dev Order Contract
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract is the part of marketplace for exhange multiple non-fungiable token with standard ERC721 and ERC1155
 *          all action which user could sell, unsell, buy them.
 */

contract OrderManager is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, IOrder {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    CountersUpgradeable.Counter private walletOrderIds;
    CountersUpgradeable.Counter private marketItemOrderIds;
    CountersUpgradeable.Counter private orderIds;

    /**
     *  @notice struct of database mapping
     */
    OrderHelper.DBOrderMap DBOrderMap;

    event SoldAvailableItem(uint256 indexed marketItemId, uint256 price, uint256 startTime, uint256 endTime);
    event CanceledSell(uint256 indexed marketItemId);
    event Bought(
        uint256 indexed marketItemId,
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        address buyer,
        MarketItemStatus status
    );
    event AcceptedOrder(
        uint256 indexed orderId,
        address owner,
        address seller,
        uint256 amount,
        address paymentToken,
        address nftContractAddress,
        uint256 tokenId,
        uint256 bidPrice,
        bool isWallet
    );
    event MakeOrder(
        uint256 indexed orderId,
        address owner,
        address to,
        address nftAddress,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 bidPrice,
        uint256 expiredTime,
        OrderHelper.OrderStatus status,
        bool isWallet
    );

    modifier validMarketItemId(uint256 _id) {
        if (!(_id <= marketplace.getCurrentMarketItem() && _id > 0)) {
            revert ErrorHelper.InvalidMarketItemId();
        }
        _;
    }

    modifier validOrderId(uint256 _id) {
        if (!(_id <= orderIds.current() && _id > 0)) {
            revert ErrorHelper.InvalidOrderId();
        }
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(IMarketplaceManager _marketplace, IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        marketplace = _marketplace;
    }

    /**
     * @dev make Order with any NFT in wallet
     *
     * Emit {MadeWalletOrder}
     */
    function makeWalletOrder(
        IERC20Upgradeable _paymentToken,
        uint256 _bidPrice,
        address _to,
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _time
    )
        external
        payable
        nonReentrant
        whenNotPaused
        validPaymentToken(_paymentToken)
        notZero(_bidPrice)
        validWallet(_to)
        notZero(_amount)
    {
        ErrorHelper._checkValidOrderTime(_time);
        ErrorHelper._checkUserCanOffer(_to);
        ErrorHelper._checkValidNFTAddress(_nftAddress);

        if (NFTHelper.isERC721(_nftAddress)) {
            ErrorHelper._checkValidOwnerOf721(_nftAddress, _tokenId, _to);
            ErrorHelper._checkValidAmountOf721(_amount);
        } else if (NFTHelper.isERC1155(_nftAddress)) {
            ErrorHelper._checkValidOwnerOf1155(_nftAddress, _tokenId, _to, _amount);
        }

        // Check exist make Offer
        OrderHelper.OrderInfo storage existOrder = DBOrderMap.orders[
            DBOrderMap.walletOrderOfOwners[_nftAddress][_tokenId][_to][_msgSender()]
        ];
        // check for update
        if (existOrder.bidPrice != 0 && existOrder.status == OrderHelper.OrderStatus.PENDING) {
            ErrorHelper._checkCanUpdatePaymentToken(address(_paymentToken), address(existOrder.paymentToken));
            OrderHelper._updateOrder(existOrder, _bidPrice, _amount, _time);
        } else {
            walletOrderIds.increment();
            orderIds.increment();
            // Create Order
            OrderHelper.WalletOrder memory walletOrder = OrderHelper.WalletOrder({
                to: _to,
                nftAddress: _nftAddress,
                tokenId: _tokenId,
                orderId: orderIds.current()
            });
            OrderHelper.OrderInfo memory orderInfo = OrderHelper.OrderInfo({
                id: orderIds.current(),
                owner: _msgSender(),
                amount: _amount,
                paymentToken: _paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderHelper.OrderStatus.PENDING,
                isWallet: true
            });

            OrderHelper._makeWalletOrder(
                walletOrderIds.current(),
                orderIds.current(),
                DBOrderMap,
                orderInfo,
                walletOrder
            );

            TransferHelper._transferToken(_paymentToken, _bidPrice, _msgSender(), address(this));

            // Emit Event
            emit MakeOrder(
                orderIds.current(),
                _msgSender(),
                walletOrder.to,
                walletOrder.nftAddress,
                walletOrder.tokenId,
                orderInfo.amount,
                address(orderInfo.paymentToken),
                orderInfo.bidPrice,
                orderInfo.expiredTime,
                orderInfo.status,
                true
            );
        }
    }

    /**
     *  @notice make Order any NFT in marketplace
     *
     *  Emit {MadeMaketItemOrder}
     */
    function makeMarketItemOrder(
        uint256 _marketItemId,
        uint256 _bidPrice,
        uint256 _time,
        bytes32[] memory _proof
    ) external payable nonReentrant whenNotPaused validMarketItemId(_marketItemId) notZero(_bidPrice) {
        ErrorHelper._checkValidOrderTime(_time);
        // Check Market Item
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(_marketItemId);
        ErrorHelper._checkValidMarketItem(uint256(marketItem.status), uint256(MarketItemStatus.LISTING));
        ErrorHelper._checkUserCanOffer(marketItem.seller);

        if (marketplace.isPrivate(_marketItemId)) {
            ErrorHelper._checkInWhiteListAndOwnNFT(address(admin), address(marketplace), _marketItemId, _proof);
        }

        OrderHelper.OrderInfo storage existOrder = DBOrderMap.orders[
            DBOrderMap.marketItemOrderOfOwners[_marketItemId][_msgSender()]
        ];

        if (existOrder.bidPrice != 0 && existOrder.status == OrderHelper.OrderStatus.PENDING) {
            OrderHelper._updateOrder(existOrder, _bidPrice, marketItem.amount, _time);
        } else {
            orderIds.increment();
            // Create Order
            OrderHelper.MarketItemOrder memory marketItemOrder = OrderHelper.MarketItemOrder({
                marketItemId: _marketItemId,
                orderId: orderIds.current()
            });

            OrderHelper.OrderInfo memory orderInfo = OrderHelper.OrderInfo({
                id: orderIds.current(),
                owner: _msgSender(),
                amount: marketItem.amount,
                paymentToken: marketItem.paymentToken,
                bidPrice: _bidPrice,
                expiredTime: _time,
                status: OrderHelper.OrderStatus.PENDING,
                isWallet: false
            });

            marketItemOrderIds.increment();

            OrderHelper._makeMarketItemOrder(
                marketItemOrderIds.current(),
                orderIds.current(),
                DBOrderMap,
                orderInfo,
                marketItemOrder
            );

            TransferHelper._transferToken(marketItem.paymentToken, _bidPrice, _msgSender(), address(this));

            // Emit Event
            emit MakeOrder(
                orderIds.current(),
                _msgSender(),
                marketItem.seller,
                marketItem.nftContractAddress,
                marketItem.tokenId,
                orderInfo.amount,
                address(orderInfo.paymentToken),
                orderInfo.bidPrice,
                orderInfo.expiredTime,
                orderInfo.status,
                false
            );
        }
    }

    /**
     *  @notice Accept Order
     *
     * * Emit {acceptOrder}
     */
    function acceptOrder(
        uint256 _orderId,
        uint256 _bidPrice
    ) external nonReentrant whenNotPaused validOrderId(_orderId) {
        address _nftContractAddress;
        uint256 _tokenId;
        uint256 _amount;
        address _tokenTransfer;
        address _seller;

        OrderHelper.OrderInfo storage orderInfo = DBOrderMap.orders[_orderId];
        if (orderInfo.isWallet) {
            OrderHelper.WalletOrder memory walletOrder = DBOrderMap.walletOrders[
                DBOrderMap.orderIdToItemId[orderInfo.id]
            ];

            ErrorHelper._checkIsSeller(walletOrder.to);

            _amount = orderInfo.amount;
            _nftContractAddress = walletOrder.nftAddress;
            _tokenId = walletOrder.tokenId;
            _tokenTransfer = walletOrder.to;
            _seller = walletOrder.to;
        } else {
            // Get Market Item
            MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(
                DBOrderMap.marketItemOrders[DBOrderMap.orderIdToItemId[orderInfo.id]].marketItemId
            );

            ErrorHelper._checkValidMarketItem(uint256(marketItem.status), uint256(MarketItemStatus.LISTING));
            ErrorHelper._checkIsSeller(marketItem.seller);

            // Update Market Item
            marketItem.status = MarketItemStatus.SOLD;
            marketItem.buyer = orderInfo.owner;
            marketplace.setMarketItemIdToMarketItem(
                DBOrderMap.marketItemOrders[DBOrderMap.orderIdToItemId[orderInfo.id]].marketItemId,
                marketItem
            );

            _amount = marketItem.amount;
            _nftContractAddress = marketItem.nftContractAddress;
            _tokenId = marketItem.tokenId;
            _tokenTransfer = address(marketplace);
            _seller = marketItem.seller;
        }

        ErrorHelper._checkInOrderTime(orderInfo.expiredTime);
        ErrorHelper._checkAvailableOrder(uint256(orderInfo.status), uint256(OrderHelper.OrderStatus.PENDING));
        ErrorHelper._checkEqualPrice(_bidPrice, orderInfo.bidPrice);

        // Update Order
        orderInfo.status = OrderHelper.OrderStatus.ACCEPTED;
        marketplace.setIsBuyer(orderInfo.owner);

        _calAndTransfer(
            orderInfo.isWallet,
            orderInfo.bidPrice,
            orderInfo.paymentToken,
            _nftContractAddress,
            _tokenId,
            _amount,
            _tokenTransfer,
            _seller,
            orderInfo.owner
        );

        // Emit event
        emit AcceptedOrder(
            _orderId,
            orderInfo.owner,
            _seller,
            _amount,
            address(orderInfo.paymentToken),
            _nftContractAddress,
            _tokenId,
            orderInfo.bidPrice,
            orderInfo.isWallet
        );
    }

    /**
     *  @notice Cancel Order
     *
     *  Emit {cancelOrder}
     */
    function cancelOrder(uint256 _orderId) external nonReentrant whenNotPaused validOrderId(_orderId) {
        OrderHelper._cancelOrder(DBOrderMap, _orderId);
    }

    /**
     *  @notice Resell Market Item avaiable in marketplace after Market Item is expired
     *
     *  Emit {SoldAvailableItem}
     */
    function sellAvailableInMarketplace(
        uint256 marketItemId,
        uint256 price,
        uint256 startTime,
        uint256 endTime
    ) external nonReentrant whenNotPaused validMarketItemId(marketItemId) notZero(price) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);

        ErrorHelper._checkValidMarketItem(uint256(marketItem.status), uint256(MarketItemStatus.LISTING));
        ErrorHelper._checkIsSeller(marketItem.seller);
        ErrorHelper._checkExpired(marketItem.endTime);
        ErrorHelper._checkValidEndTime(endTime);

        marketItem.price = price;
        marketItem.startTime = startTime;
        marketItem.endTime = endTime;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);

        emit SoldAvailableItem(marketItemId, marketItem.price, marketItem.startTime, marketItem.endTime);
    }

    /**
     *  @notice Sell any nft
     *
     *  @dev    All caller can call this function.
     */
    function sell(
        address _nftAddress,
        uint256 _tokenId,
        uint256 _amount,
        uint256 _price,
        uint256 _startTime,
        uint256 _endTime,
        IERC20Upgradeable _paymentToken
    )
        external
        nonReentrant
        whenNotPaused
        notZeroAddress(_nftAddress)
        validPaymentToken(_paymentToken)
        notZero(_price)
        notZero(_amount)
    {
        // ErrorHelper._checkValidNFTAddress(_nftAddress);
        ErrorHelper._checkExistToken(_nftAddress, _tokenId);

        if (NFTHelper.getType(_nftAddress) == NFTHelper.Type.ERC721) {
            ErrorHelper._checkValidAmountOf721(_amount);
        }
        // transfer nft to contract for selling
        marketplace.extTransferNFTCall(_nftAddress, _tokenId, _amount, _msgSender(), address(marketplace));
        // create market item to store data selling
        marketplace.extCreateMarketInfo(
            _nftAddress,
            _tokenId,
            _amount,
            _price,
            _msgSender(),
            _startTime,
            _endTime,
            _paymentToken
        );
    }

    /**
     *  @notice Canncel any nft which selling
     *
     *  @dev    All caller can call this function.
     *
     *  Emit {CanceledSell}
     */
    function cancelSell(uint256 marketItemId) external nonReentrant whenNotPaused validMarketItemId(marketItemId) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        ErrorHelper._checkValidMarketItem(uint256(marketItem.status), uint256(MarketItemStatus.LISTING));
        ErrorHelper._checkIsSeller(marketItem.seller);
        // Update Market Item
        marketItem.status = MarketItemStatus.CANCELED;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);
        // transfer nft back to seller
        marketplace.extTransferNFTCall(
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            _msgSender()
        );

        emit CanceledSell(marketItemId);
    }

    /**
     *  @notice Buy any nft which selling
     *
     *  @dev    All caller can call this function.
     *
     *  Emit {Bought}
     */
    function buy(
        uint256 marketItemId,
        bytes32[] calldata proof
    ) external payable nonReentrant whenNotPaused validMarketItemId(marketItemId) {
        MarketItem memory marketItem = marketplace.getMarketItemIdToMarketItem(marketItemId);
        ErrorHelper._checkValidMarketItem(uint256(marketItem.status), uint256(MarketItemStatus.LISTING));
        ErrorHelper._checkOwnerOfMarketItem(marketItem.seller);
        ErrorHelper._checkMarketItemInSelling(marketItem.startTime, marketItem.endTime);
        // Only check when market item is in private collection
        if (marketplace.isPrivate(marketItemId)) {
            ErrorHelper._checkInWhiteListAndOwnNFT(address(admin), address(marketplace), marketItemId, proof);
        }

        // update new buyer for martket item
        marketItem.buyer = _msgSender();
        marketItem.status = MarketItemStatus.SOLD;
        marketplace.setMarketItemIdToMarketItem(marketItemId, marketItem);
        marketplace.setIsBuyer(_msgSender());
        // Transfer token to contract
        TransferHelper._transferToken(marketItem.paymentToken, marketItem.price, _msgSender(), address(this));

        _calAndTransfer(
            false,
            marketItem.price,
            marketItem.paymentToken,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            address(marketplace),
            marketItem.seller,
            _msgSender()
        );

        emit Bought(
            marketItemId,
            marketItem.nftContractAddress,
            marketItem.tokenId,
            marketItem.amount,
            marketItem.price,
            marketItem.buyer,
            marketItem.status
        );
    }

    function _calAndTransfer(
        bool _isWallet,
        uint256 _bidPrice,
        IERC20Upgradeable _paymentToken,
        address _nftContractAddress,
        uint256 _tokenId,
        uint256 _amount,
        address _tokenTransfer,
        address _seller,
        address _buyer
    ) private {
        uint256 _listingFee = marketplace.getListingFee(_bidPrice);
        // pay listing fee
        uint256 netSaleValue = _bidPrice - _listingFee;

        // Pay royalties from the amount actually received
        netSaleValue = OrderHelper._deduceRoyalties(_nftContractAddress, _tokenId, netSaleValue, _paymentToken);

        // Transfer Token from Buyer to Seller
        TransferHelper._transferToken(_paymentToken, netSaleValue, address(this), _seller);
        TransferHelper._transferToken(_paymentToken, _listingFee, address(this), admin.treasury());

        // Transfer NFT from Seller to Buyer
        if (_isWallet) {
            NFTHelper.transferNFTCall(_nftContractAddress, _tokenId, _amount, _tokenTransfer, _buyer);
        } else {
            marketplace.extTransferNFTCall(_nftContractAddress, _tokenId, _amount, _tokenTransfer, _buyer);
        }
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC165Upgradeable, IERC165Upgradeable) returns (bool) {
        return interfaceId == type(IOrder).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     *  @notice Get order by order id
     *
     *  @dev    All caller can call this function.
     */
    function getOrderByOrderId(uint256 orderId) external view returns (OrderHelper.OrderInfo memory) {
        return DBOrderMap.orders[orderId];
    }

    /**
     *  @notice Get market order by order id
     *
     *  @dev    All caller can call this function.
     */
    function getMarketOrderByOrderId(uint256 orderId) external view returns (OrderHelper.MarketItemOrder memory) {
        return DBOrderMap.marketItemOrders[DBOrderMap.orderIdToItemId[orderId]];
    }

    /**
     *  @notice Get wallet order by order id
     *
     *  @dev    All caller can call this function.
     */
    function getWalletOrderByOrderId(uint256 orderId) external view returns (OrderHelper.WalletOrder memory) {
        return DBOrderMap.walletOrders[DBOrderMap.orderIdToItemId[orderId]];
    }

    /**
     *  @notice Get current market item order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentWalletOrderId() external view returns (uint256) {
        return walletOrderIds.current();
    }

    /**
     *  @notice Get current market item order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentMarketItemOrderId() external view returns (uint256) {
        return marketItemOrderIds.current();
    }

    /**
     *  @notice Get current order id
     *
     *  @dev    All caller can call this function.
     */
    function getCurrentOrderId() external view returns (uint256) {
        return orderIds.current();
    }
}
