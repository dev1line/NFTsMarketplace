// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "../interfaces/IStakingPool.sol";
import "../interfaces/IPoolFactory.sol";
import "../Validatable.sol";

contract PoolFactory is Validatable, ERC165Upgradeable, IPoolFactory {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    IStakingPool public template;

    CountersUpgradeable.Counter private _poolCounter;
    EnumerableSetUpgradeable.AddressSet private _pools;

    /**
     *  @notice This struct defining data of the Pool
     *
     *  @param salt                 Additional data to make the Pool unique.
     *  @param poolAddress          Address of the pool.
     */
    struct PoolInfo {
        bytes32 salt;
        address poolAddress;
    }
    mapping(uint256 => PoolInfo) public poolIdToPoolInfos;
    mapping(address => EnumerableSetUpgradeable.UintSet) private _ownerToPoolIds;

    event PoolDeployed(address pool, address deployer);

    function initialize(IStakingPool _template, IAdmin _admin) public initializer {
        __Validatable_init(_admin);
        __ERC165_init();

        template = _template;
        admin = _admin;
    }

    function create(
        IERC20Upgradeable _stakeToken,
        IERC20Upgradeable _rewardToken,
        IMarketplaceManager _mkpManagerAddrress,
        uint256 _rewardRate,
        uint256 _poolDuration,
        address _pancakeRouter,
        address _busdToken,
        address _aggregatorProxyBUSD_USD
    ) external onlyAdmin whenNotPaused {
        _poolCounter.increment();
        uint256 currentId = _poolCounter.current();
        bytes32 salt = bytes32(currentId);
        IStakingPool pool = IStakingPool(ClonesUpgradeable.cloneDeterministic(address(template), salt));
        ErrorHelper._checkValidClone(address(pool));
        // store
        PoolInfo memory newInfo = PoolInfo(salt, address(pool));
        poolIdToPoolInfos[currentId] = newInfo;

        // initialize
        pool.initialize(
            _stakeToken,
            _rewardToken,
            _mkpManagerAddrress,
            _rewardRate,
            _poolDuration,
            _pancakeRouter,
            _busdToken,
            _aggregatorProxyBUSD_USD,
            admin
        );

        emit PoolDeployed(address(pool), _msgSender());
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC165Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return interfaceId == type(IPoolFactory).interfaceId || super.supportsInterface(interfaceId);
    }

    function getPool(uint256 id) public view returns (address) {
        bytes32 salt = bytes32(id);
        return ClonesUpgradeable.predictDeterministicAddress(address(template), salt);
    }

    function getPoolInfo(uint256 id) public view returns (PoolInfo memory) {
        return poolIdToPoolInfos[id];
    }

    function getAllPool() public view returns (PoolInfo[] memory) {
        PoolInfo[] memory allPools = new PoolInfo[](_poolCounter.current());
        for (uint256 i = 0; i < _poolCounter.current(); i++) {
            allPools[i] = poolIdToPoolInfos[i + 1];
        }
        return allPools;
    }
}
