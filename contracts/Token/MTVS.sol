// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IMTVS.sol";

error InvalidAddress();
error InvalidAmount();

/**
 *  @title  Dev Fungible token
 *
 *  @author Marketplace Team
 *
 *  @notice This smart contract create the token ERC20 for Operation. These tokens initially are minted
 *          by the only controllers and using for purchase in marketplace operation.
 *          The contract here by is implemented to initial.
 */

contract MTVS is ERC20, ERC165, IMTVS {
    modifier validAmount(uint256 _amount) {
        if (_amount == 0) {
            revert InvalidAmount();
        }
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _treasury
    ) ERC20(_name, _symbol) validAmount(_totalSupply) {
        if (_treasury == address(0)) {
            revert InvalidAddress();
        }
        _mint(_treasury, _totalSupply);
    }

    /**
     *  @notice Burn token
     *
     *  @dev   All caller can call this function.
     */
    function burn(uint256 amount) external validAmount(amount) {
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IMTVS).interfaceId || super.supportsInterface(interfaceId);
    }
}
