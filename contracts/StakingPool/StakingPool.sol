// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "../interfaces/IMarketplaceManager.sol";
import "../interfaces/IPancakeRouter.sol";
import "../interfaces/IStakingPool.sol";
import "../Validatable.sol";
import "../lib/ErrorHelper.sol";

/**
 *  @title  Dev Staking Pool Contract
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract is the staking pool for staking, earning more MTVS token with standard ERC20
 *          all action which user could stake, unstake, claim them.
 */
contract StakingPool is Validatable, ReentrancyGuardUpgradeable, ERC165Upgradeable, IStakingPool {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     *  @notice This struct defining data when execute lazily
     *
     *  @param unlockedTime                 Time when the Pool unlocked.
     *  @param isRequested                  Indicating if the Pool is request to be created.
     */
    struct Lazy {
        uint256 unlockedTime;
        bool isRequested;
    }

    /**
     *  @notice This struct defining data when create staking pool lazily
     *
     *  @param totalAmount                  Total amount of the pool.
     *  @param pendingRewards               Pening reward to claim.
     *  @param lastClaim                    Time when the last claim transaction happened.
     *  @param lazyUnstake                  Lazily unstaking information.
     *  @param lazyClaim                    Lazily claiming information.
     */
    struct UserInfo {
        uint256 totalAmount;
        uint256 pendingRewards;
        uint256 lastClaim;
        Lazy lazyUnstake;
        Lazy lazyClaim;
    }

    /**
     *  @notice stakedAmount uint256 is amount of staked token.
     */
    uint256 public stakedAmount;

    /**
     *  @notice rewardRate uint256 is rate of token.
     */
    uint256 public rewardRate;

    /**
     *  @notice poolDuration uint256 is duration of staking pool to end-time.
     */
    uint256 public poolDuration;

    /**
     *  @notice pendingTime uint256 is time after request unstake for waiting.
     */
    uint256 public pendingTime;

    /**
     *  @notice startTime is timestamp start staking in pool.
     */
    uint256 public startTime;

    /**
     *  @notice acceptableLost is timestamp start staking in pool.
     */
    uint256 public acceptableLost;

    /**
     *  @notice stakeToken IERC20 is interface of staked token.
     */
    IERC20Upgradeable public stakeToken;

    /**
     *  @notice rewardToken IERC20 is interfacce of reward token.
     */
    IERC20Upgradeable public rewardToken;

    /**
     *  @notice mkpManager is address of Marketplace Manager
     */
    IMarketplaceManager public mkpManager;

    /**
     *  @notice busdToken is address that price of token equal to one USD
     */
    address public busdToken;

    /**
     *  @notice aggregatorProxyBUSD_USD is address that price of BUSD/USD
     */
    address public aggregatorProxyBUSD_USD;

    /**
     *  @notice pancakeRouter is address of Pancake Router
     */
    address public pancakeRouter;

    /**
     *  @notice timeStone is period calculate reward
     */
    uint256 public timeStone;

    /**
     *  @notice Mapping an address to a information of corresponding user address.
     */
    mapping(address => UserInfo) public users;

    event Staked(address indexed user, uint256 amount);
    event UnStaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event EmergencyWithdrawed(address indexed owner, address indexed token);
    event SetRewardRate(uint256 indexed rate);
    event SetPendingTime(uint256 indexed pendingTime);
    event SetDuration(uint256 indexed poolDuration);
    event SetStartTime(uint256 indexed poolDuration);
    event RequestUnstake(address indexed sender);
    event RequestClaim(address indexed sender);
    event SetAcceptableLost(uint256 lost);
    event SetTimeStone(uint256 timeStone);

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(
        IERC20Upgradeable _stakeToken,
        IERC20Upgradeable _rewardToken,
        IMarketplaceManager _mkpManagerAddrress,
        uint256 _rewardRate,
        uint256 _poolDuration,
        address _pancakeRouter,
        address _busdToken,
        address _aggregatorProxyBUSD_USD,
        IAdmin _admin
    )
        external
        initializer
        notZeroAddress(address(_stakeToken))
        notZeroAddress(address(_rewardToken))
        validMarketplaceManager(_mkpManagerAddrress)
        notZero(_rewardRate)
        notZero(_poolDuration)
    {
        __Validatable_init(_admin);
        __ReentrancyGuard_init();
        __ERC165_init();

        stakeToken = IERC20Upgradeable(_stakeToken);
        rewardToken = IERC20Upgradeable(_rewardToken);
        aggregatorProxyBUSD_USD = _aggregatorProxyBUSD_USD;
        rewardRate = _rewardRate;
        poolDuration = _poolDuration;
        mkpManager = _mkpManagerAddrress;
        pancakeRouter = _pancakeRouter;
        busdToken = _busdToken;
        pendingTime = 1 days; // default
        acceptableLost = 50; // 50%
        timeStone = 86400;
    }

    /**
     *  @notice Request withdraw before unstake activity
     */
    function requestUnstake() external nonReentrant whenNotPaused returns (uint256) {
        ErrorHelper._checkUnstakeTime(startTime, poolDuration);
        UserInfo storage user = users[_msgSender()];
        ErrorHelper._checkIsRequested(user.lazyUnstake.isRequested);
        user.lazyUnstake.isRequested = true;
        user.lazyUnstake.unlockedTime = block.timestamp + pendingTime;

        emit RequestUnstake(_msgSender());
        return user.lazyUnstake.unlockedTime;
    }

    /**
     *  @notice Request claim before unstake activity
     */
    function requestClaim() external nonReentrant whenNotPaused returns (uint256) {
        ErrorHelper._checkClaimTime(startTime, poolDuration);
        UserInfo storage user = users[_msgSender()];
        ErrorHelper._checkIsRequested(user.lazyClaim.isRequested);

        user.lazyClaim.isRequested = true;
        user.lazyClaim.unlockedTime = block.timestamp + pendingTime;

        emit RequestClaim(_msgSender());
        return user.lazyClaim.unlockedTime;
    }

    /**
     *  @notice Stake amount of token to staking pool.
     *
     *  @dev    Only user has NFT can call this function.
     */
    function stake(uint256 _amount) external notZero(_amount) nonReentrant whenNotPaused {
        ErrorHelper._checkTimeForStake(startTime, poolDuration);
        ErrorHelper._checkAmountOfStake(getAmountOutWith(_amount));
        if (!IMarketplaceManager(mkpManager).wasBuyer(_msgSender())) {
            revert ErrorHelper.MustBuyNFTInMarketplaceFirst();
        }
        // calculate pending rewards of staked amount before
        UserInfo storage user = users[_msgSender()];
        if (user.totalAmount > 0) {
            uint256 pending = calReward(_msgSender());
            if (pending > 0) {
                user.pendingRewards = user.pendingRewards + pending;
            }
        }
        user.lastClaim = block.timestamp;

        // add extra token just deposited
        user.totalAmount += _amount;
        stakedAmount += _amount;

        // request transfer token
        stakeToken.safeTransferFrom(_msgSender(), address(this), _amount);

        emit Staked(_msgSender(), _amount);
    }

    /**
     *  @notice Claim all reward in pool.
     */
    function claim() external nonReentrant whenNotPaused {
        UserInfo storage user = users[_msgSender()];
        ErrorHelper._checkClaimTime(startTime, poolDuration);
        ErrorHelper._checkAcceptRequested(user.lazyClaim.isRequested);
        // update status of request
        user.lazyClaim.isRequested = false;
        if (user.totalAmount > 0) {
            uint256 pending = pendingRewards(_msgSender());
            if (pending > 0) {
                user.pendingRewards = 0;
                if (block.timestamp <= user.lazyClaim.unlockedTime) {
                    pending -= (pending * acceptableLost) / 100;
                }
                // transfer token
                rewardToken.safeTransfer(_msgSender(), pending);
                emit Claimed(_msgSender(), pending);
            }
        }
        // update timestamp
        user.lastClaim = block.timestamp;
    }

    /**
     *  @notice Unstake amount of rewards caller request.
     */
    function unstake(uint256 _amount) external notZero(_amount) nonReentrant whenNotPaused {
        UserInfo storage user = users[_msgSender()];

        ErrorHelper._checkUnstakeTime(startTime, poolDuration);
        ErrorHelper._checkMustRequested(user.lazyUnstake.isRequested, user.lazyUnstake.unlockedTime);
        ErrorHelper._checkExceed(user.totalAmount, _amount);
        // Auto claim
        uint256 pending = pendingRewards(_msgSender());

        // update status of request
        user.lazyUnstake.isRequested = false;
        user.lazyClaim.isRequested = false;
        user.lastClaim = block.timestamp;

        // update data before transfer
        user.totalAmount -= _amount;
        stakedAmount -= _amount;

        // claim token
        if (pending > 0) {
            user.pendingRewards = 0;
            rewardToken.safeTransfer(_msgSender(), pending);
        }

        // transfer token
        stakeToken.safeTransfer(_msgSender(), _amount);
        emit UnStaked(_msgSender(), _amount);
    }

    /**
     *  @notice Admin can withdraw excess cash back.
     *
     *  @dev    Only admin can call this function.
     */
    function emergencyWithdraw() external onlyAdmin nonReentrant {
        if (rewardToken == stakeToken) {
            rewardToken.safeTransfer(admin.owner(), rewardToken.balanceOf(address(this)) - stakedAmount);
        } else {
            rewardToken.safeTransfer(admin.owner(), rewardToken.balanceOf(address(this)));
        }

        emit EmergencyWithdrawed(_msgSender(), address(rewardToken));
    }

    /**
     *  @notice Set start time of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setTimeStone(uint256 _timeStone) external onlyAdmin {
        timeStone = _timeStone;
        emit SetTimeStone(timeStone);
    }

    /**
     *  @notice Set start time of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setStartTime(uint256 _startTime) external onlyAdmin {
        startTime = _startTime;
        emit SetStartTime(startTime);
    }

    /**
     *  @notice Set acceptable Lost of staking pool.
     */
    function setAcceptableLost(uint256 lost) external onlyAdmin {
        if (lost > 100) {
            revert ErrorHelper.OverLimit();
        }
        acceptableLost = lost;
        emit SetAcceptableLost(acceptableLost);
    }

    /**
     *  @notice Set reward rate of staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setRewardRate(uint256 _rewardRate) external notZero(rewardRate) onlyAdmin {
        rewardRate = _rewardRate;
        emit SetRewardRate(rewardRate);
    }

    /**
     *  @notice Set pending time for unstake from staking pool.
     *
     *  @dev    Only owner can call this function.
     */
    function setPendingTime(uint256 _pendingTime) external notZero(_pendingTime) onlyAdmin {
        pendingTime = _pendingTime;
        emit SetPendingTime(pendingTime);
    }

    /**
     *  @notice Set pool duration.
     *
     *  @dev    Only owner can call this function.
     */
    function setPoolDuration(uint256 _poolDuration) external notZero(poolDuration) onlyAdmin {
        poolDuration = _poolDuration;
        emit SetDuration(poolDuration);
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
        return interfaceId == type(IStakingPool).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     *  @notice Get amount of deposited token of corresponding user address.
     */
    function getUserAmount(address user) external view returns (uint256) {
        return users[user].totalAmount;
    }

    /**
     *  @notice Get pending claim time of corresponding user address.
     */
    function getPendingClaimTime(address user) external view returns (uint256) {
        return users[user].lazyClaim.unlockedTime;
    }

    /**
     *  @notice Get pending unstake time of corresponding user address.
     */
    function getPendingUnstakeTime(address user) external view returns (uint256) {
        return users[user].lazyUnstake.unlockedTime;
    }

    /**
     *  @notice Get all params
     */
    function getAllParams()
        external
        view
        returns (address, address, uint256, uint256, uint256, uint256, uint256, bool)
    {
        return (
            address(stakeToken),
            address(mkpManager),
            stakedAmount,
            poolDuration,
            rewardRate,
            startTime,
            pendingTime,
            isActivePool()
        );
    }

    /**
     *  @notice Get price of token
     */
    function getPriceFormatUSD(address _tokenIn, address _tokenOut, uint _amountIn) public view returns (uint) {
        address[] memory path;
        path = new address[](2);
        path[0] = _tokenIn;
        path[1] = _tokenOut;
        uint[] memory amountOutMins = IPancakeRouter(pancakeRouter).getAmountsOut(_amountIn, path);
        return amountOutMins[path.length - 1];
    }

    /**
     * Returns the latest price
     */
    function getAmountOutWith(uint amount) public view returns (uint) {
        (, int price, , , ) = AggregatorV3Interface(aggregatorProxyBUSD_USD).latestRoundData();
        return ((getPriceFormatUSD(address(stakeToken), busdToken, 1e18) * amount) / uint(price * 1e10));
    }

    /**
     *  @notice Get status of pool
     */
    function isActivePool() public view returns (bool) {
        return (startTime + poolDuration >= block.timestamp) && !isPaused();
    }

    /**
     *  @notice Check a mount of pending reward in pool of corresponding user address.
     */
    function pendingRewards(address _user) public view returns (uint256) {
        UserInfo memory user = users[_user];
        if (startTime <= block.timestamp) {
            uint256 amount = calReward(_user);
            amount = amount + user.pendingRewards;
            return amount;
        }
        return 0;
    }

    /**
     *  @notice Return a pending amount of reward token.
     */
    function calReward(address _user) public view returns (uint256) {
        UserInfo memory user = users[_user];
        uint256 minTime = min(block.timestamp, startTime + poolDuration);
        if (minTime < user.lastClaim) {
            return 0;
        }
        // reward by each days
        uint256 time = ((minTime - user.lastClaim) / timeStone) * timeStone;
        uint256 amount = (user.totalAmount * time * rewardRate) / 1e18;

        return amount;
    }

    /**
     *  @notice Return minimun value betwween two params.
     */
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a < b) return a;
        return b;
    }
}
