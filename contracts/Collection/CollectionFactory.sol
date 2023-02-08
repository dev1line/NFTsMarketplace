// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/Collection/ICollection.sol";
import "../interfaces/Collection/ICollectionFactory.sol";
import "../interfaces/IMarketplaceManager.sol";
import "../Validatable.sol";
import "../lib/NFTHelper.sol";

contract CollectionFactory is ICollectionFactory, Validatable, ERC165Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    uint256 public maxCollection;
    uint256 public maxTotalSupply;
    ICollection public templateERC721;
    ICollection public templateERC1155;
    address public MarketplaceManager;
    address public metaDrop;

    CountersUpgradeable.Counter private _collectionCounter;

    /**
     *  @notice marketplace store the address of the marketplaceManager contract
     */
    IMarketplaceManager public marketplace;

    /**
     *  @notice This struct defining data for each item selling on the marketplace
     *
     *  @param typeNft                      Type of NFT
     *  @param salt                         Additional data to make the Collection unique
     *  @param collectionAddress            Address of the Collection
     *  @param owner                        Owner's Address of the Collection
     */
    struct CollectionInfo {
        NFTHelper.Type typeNft;
        bytes32 salt;
        address collectionAddress;
        address owner;
    }

    mapping(address => uint256) public maxCollectionOfUsers;
    mapping(uint256 => CollectionInfo) public collectionIdToCollectionInfos;
    mapping(address => EnumerableSetUpgradeable.AddressSet) private _ownerToCollectionAddress;

    event CollectionDeployed(
        NFTHelper.Type collectType,
        address collection,
        string name,
        string symbol,
        address deployer,
        address receiverRoyalty,
        uint96 feeNumerator
    );
    event SetMaxCollection(uint256 indexed oldValue, uint256 indexed newValue);
    event SetMaxTotalSuply(uint256 indexed oldValue, uint256 indexed newValue);
    event SetTemplateAddress(address indexed templateERC721, address indexed templateERC1155);
    event SetMaxCollectionOfUser(uint256 indexed oldValue, uint256 indexed newValue);
    event SetMarketplaceManager(address indexed oldAddress, address indexed newAddress);
    event SetMetaDrop(address indexed oldAddress, address indexed newAddress);
    event SetMarketplace(IMarketplaceManager indexed oldMarketplace, IMarketplaceManager indexed newMarketplace);

    function initialize(
        ICollection _templateERC721,
        ICollection _templateERC1155,
        IAdmin _admin,
        address _MarketplaceManager,
        address _metaDrop,
        address _marketplace
    ) public initializer {
        __ERC165_init();
        __Validatable_init(_admin);

        templateERC721 = _templateERC721;
        templateERC1155 = _templateERC1155;
        MarketplaceManager = _MarketplaceManager;
        metaDrop = _metaDrop;
        marketplace = IMarketplaceManager(_marketplace);
        maxCollection = 5;
        maxTotalSupply = 100;
    }

    function create(
        NFTHelper.Type _typeNft,
        string memory _name,
        string memory _symbol,
        address _receiverRoyalty,
        uint96 _feeNumerator,
        bytes calldata rootHash
    ) external whenNotPaused {
        if (maxCollectionOfUsers[_msgSender()] == 0) {
            maxCollectionOfUsers[_msgSender()] = maxCollection;
        }

        ErrorHelper._checkExceedMaxCollection(
            _ownerToCollectionAddress[_msgSender()].length(),
            maxCollectionOfUsers[_msgSender()]
        );
        _collectionCounter.increment();
        uint256 _currentId = _collectionCounter.current();
        bytes32 salt = bytes32(_currentId);
        address _template = _typeNft == NFTHelper.Type.ERC721 ? address(templateERC721) : address(templateERC1155);
        ICollection _collection = ICollection(ClonesUpgradeable.cloneDeterministic(address(_template), salt));
        ErrorHelper._checkCloneCollection(address(_collection));
        // store
        CollectionInfo memory newInfo = CollectionInfo(_typeNft, salt, address(_collection), admin.owner());
        collectionIdToCollectionInfos[_currentId] = newInfo;

        // initialize
        _collection.initialize(admin.owner(), _name, _symbol, maxTotalSupply, _receiverRoyalty, _feeNumerator);

        // set roothash
        marketplace.setNewRootHash(address(_collection), rootHash);
        // setAdmin
        _collection.setAdminByFactory(metaDrop, true);
        _collection.setAdminByFactory(MarketplaceManager, true);

        _ownerToCollectionAddress[_msgSender()].add(address(_collection));

        emit CollectionDeployed(
            _typeNft,
            address(_collection),
            _name,
            _symbol,
            _msgSender(),
            _receiverRoyalty,
            _feeNumerator
        );
    }

    /**
     *  @notice Set Marketplace to change MarketplaceManager address.
     *
     *  @dev    Only owner or admin can call this function.
     */
    function setMarketplace(
        IMarketplaceManager _newMarketplace
    ) external onlyAdmin validMarketplaceManager(_newMarketplace) {
        IMarketplaceManager oldMarketplace = marketplace;
        marketplace = _newMarketplace;
        emit SetMarketplace(oldMarketplace, marketplace);
    }

    /**
     *  @notice Set maxCollection value to mint
     *  @param  _newValue that set maxCollection value
     */
    function setMaxCollection(uint256 _newValue) external onlyAdmin {
        ErrorHelper._checkMaxCollection(_newValue);
        uint256 _oldValue = maxCollection;
        maxCollection = _newValue;
        emit SetMaxCollection(_oldValue, maxCollection);
    }

    /**
     *  @notice Set maxTotalSupply value to mint
     *  @param  _newValue that set maxTotalSupply value
     */
    function setMaxTotalSuply(uint256 _newValue) external onlyAdmin {
        ErrorHelper._checkMaxTotalSupply(_newValue);
        uint256 _oldValue = maxTotalSupply;
        maxTotalSupply = _newValue;
        emit SetMaxTotalSuply(_oldValue, maxTotalSupply);
    }

    /**
     *  @notice Set max collection of user
     *  @param  _newValue that set max collection of user value
     */
    function setMaxCollectionOfUser(address _user, uint256 _newValue) external onlyAdmin notZeroAddress(_user) {
        ErrorHelper._checkMaxCollectionOfUser(_newValue);
        uint256 _oldValue = maxCollectionOfUsers[_user];
        maxCollectionOfUsers[_user] = _newValue;
        emit SetMaxCollectionOfUser(_oldValue, _newValue);
    }

    /**
     *  @notice Set template dddress
     *  @param  _templateERC721 that set erc721 address
     *  @param  _templateERC1155 that set erc1155 address
     */
    function setTemplateAddress(
        address _templateERC721,
        address _templateERC1155
    ) external notZeroAddress(_templateERC721) notZeroAddress(_templateERC1155) onlyAdmin {
        templateERC721 = ICollection(_templateERC721);
        templateERC1155 = ICollection(_templateERC1155);

        emit SetTemplateAddress(_templateERC721, _templateERC1155);
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
        return interfaceId == type(ICollectionFactory).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     *  @notice Set Marketplace manager dddress
     *  @param  _newAddress that set erc721 address
     */
    function setMarketplaceManager(address _newAddress) external notZeroAddress(_newAddress) onlyAdmin {
        address _oldAddress = MarketplaceManager;
        MarketplaceManager = _newAddress;

        emit SetMarketplaceManager(_oldAddress, _newAddress);
    }

    /**
     *  @notice Set metaDrop dddress
     *  @param  _newAddress that set metaDrop address
     */
    function setMetaDrop(address _newAddress) external notZeroAddress(_newAddress) onlyAdmin {
        address _oldAddress = metaDrop;
        metaDrop = _newAddress;

        emit SetMetaDrop(_oldAddress, _newAddress);
    }

    function checkCollectionOfUser(address _user, address _nft) external view returns (bool) {
        return _ownerToCollectionAddress[_user].contains(_nft);
    }

    function getCollectionByUser(address _user) external view returns (address[] memory) {
        return _ownerToCollectionAddress[_user].values();
    }

    function getCollectionLength() public view returns (uint256) {
        return _collectionCounter.current();
    }
}
